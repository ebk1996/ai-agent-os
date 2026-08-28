const { OpenAI } = require("openai");

const XAI_BASE = "https://api.x.ai/v1";
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 45000);
const MIN_GAP_MS = Number(process.env.LLM_MIN_GAP_MS || 2500);

const skippedModels = new Map();
let openaiSkipUntil = 0;
let spacexaiSkipUntil = 0;
let pauseUntil = 0;
let lastCallAt = 0;
let chain = Promise.resolve();

class LlmPauseError extends Error {
  constructor(retryMs, friendly) {
    super(friendly);
    this.name = "LlmPauseError";
    this.code = "LLM_PAUSE";
    this.retryMs = retryMs;
    this.friendly = friendly;
  }
}

function configuredProviders() {
  return {
    spacexai: Boolean(process.env.XAI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY)
  };
}

function activeProvider() {
  const configured = configuredProviders();
  if (configured.spacexai && Date.now() >= spacexaiSkipUntil) return "spacexai";
  if (configured.gemini) return "gemini";
  if (configured.anthropic) return "anthropic";
  if (configured.openai && Date.now() >= openaiSkipUntil) return "openai";
  return configured.openai ? "openai" : null;
}

function providerStatus() {
  const now = Date.now();
  return {
    mode: "cloud",
    active: activeProvider(),
    configured: configuredProviders(),
    paused: now < pauseUntil,
    resumeAt: now < pauseUntil ? new Date(pauseUntil).toISOString() : null,
    ollama: {
      enabled: false,
      reason: "Disabled. Local models need more RAM and disk than this machine has."
    }
  };
}

function extractText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).join("\n");
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    if (value.content) return extractText(value.content);
  }
  return "";
}

function classify(err) {
  const raw = String(err?.message || err || "");
  const text = raw.toLowerCase();
  const retryMatch = raw.match(/retry in ([\d.]+)\s*s/i) || raw.match(/"retrydelay":"(\d+)s"/i);
  const retryMs = retryMatch ? Math.ceil(Number(retryMatch[1]) * 1000) : 20000;
  return {
    raw,
    daily: /perday|free_tier|quota exceeded|resource_exhausted/.test(text),
    noCredits: /no credits remaining|insufficient_quota/.test(text),
    invalidKey: /incorrect api key|invalid api key|invalid api_key|unauthorized/.test(text),
    unavailable: /503|high demand|unavailable|aborted|overloaded/.test(text),
    rateLimited: /429|resource_exhausted|quota/.test(text),
    retryMs: Math.min(Math.max(retryMs, 5000), 120000)
  };
}

function friendlyFrom(classified) {
  if (classified.noCredits) {
    return "OpenAI has no credits. AGENT007 will skip it and use other cloud keys.";
  }
  if (classified.daily) {
    return "Gemini free-tier daily limit reached on one model. AGENT007 will try other models, then wait and retry jobs. Add Google AI billing, OpenAI credits, or XAI_API_KEY.";
  }
  if (classified.unavailable) {
    return "Gemini is busy. AGENT007 will retry shortly.";
  }
  return "Cloud LLM temporarily unavailable. AGENT007 will retry.";
}

function skipModel(model, ms) {
  skippedModels.set(model, Date.now() + ms);
}

function modelAllowed(model) {
  const until = skippedModels.get(model) || 0;
  return Date.now() >= until;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${LLM_TIMEOUT_MS}ms`)),
          LLM_TIMEOUT_MS
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function respectGap() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

function enqueue(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function callOpenAICompatible({ apiKey, baseURL, model, system, user, maxTokens, label }) {
  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 0
  });
  const completion = await withTimeout(
    client.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    }),
    label
  );
  const text = completion.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error("Empty model response");
  return { text: text.trim(), model, usage: completion.usage || null };
}

function geminiModels() {
  return [
    ...new Set(
      [
        process.env.GEMINI_LIGHT_MODEL,
        "gemini-3.5-flash-lite",
        process.env.GEMINI_PRIMARY_MODEL,
        process.env.GEMINI_MODEL
      ].filter(Boolean)
    )
  ].filter(modelAllowed);
}

async function callGemini({ system, user, maxTokens }) {
  const models = geminiModels();
  if (!models.length) {
    throw new Error("Gemini daily quota exhausted on all known models");
  }

  let lastClassified = null;
  for (const model of models) {
    try {
      await respectGap();
      const abort = AbortSignal.timeout(LLM_TIMEOUT_MS);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal: abort,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 }
          })
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = body?.error?.message || `Gemini ${res.status}`;
        const classified = classify(new Error(JSON.stringify(body?.error || { message, status: res.status })));
        lastClassified = classified;
        if (classified.daily || classified.rateLimited || classified.unavailable) {
          skipModel(model, classified.daily ? 6 * 60 * 60 * 1000 : classified.retryMs);
          continue;
        }
        continue;
      }
      const text = extractText(body?.candidates?.[0]?.content) || extractText(body);
      if (text.trim()) return { text: text.trim(), model, usage: null };
    } catch (err) {
      const classified = classify(err);
      lastClassified = classified;
      if (classified.daily || classified.rateLimited || classified.unavailable) {
        skipModel(model, classified.daily ? 6 * 60 * 60 * 1000 : classified.retryMs);
      }
    }
  }
  if (lastClassified?.daily || lastClassified?.rateLimited) {
    throw new Error(friendlyFrom(lastClassified));
  }
  throw new Error(lastClassified ? friendlyFrom(lastClassified) : "Gemini failed");
}

async function callAnthropic({ system, user, maxTokens }) {
  const models = [
    ...new Set(
      [
        process.env.ANTHROPIC_MODEL,
        "claude-haiku-4-5-20251001",
        "claude-haiku-4-5",
        "claude-sonnet-4-6",
        "claude-3-5-haiku-20241022"
      ].filter(Boolean)
    )
  ];
  let lastError = null;
  for (const model of models) {
    try {
      await respectGap();
      const abort = AbortSignal.timeout(LLM_TIMEOUT_MS);
      const headers = {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      };
      if (process.env.ANTHROPIC_WORKSPACE_ID) {
        headers["anthropic-workspace-id"] = process.env.ANTHROPIC_WORKSPACE_ID;
      }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: abort,
        headers,
        body: JSON.stringify({
          model,
          max_tokens: Math.min(maxTokens, 1024),
          temperature: 0.4,
          system,
          messages: [{ role: "user", content: user }]
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = new Error(body?.error?.message || `Anthropic ${res.status}`);
        continue;
      }
      const text = (body.content || []).map((part) => part.text || "").join("\n").trim();
      if (text) return { text, model, usage: body.usage || null };
      lastError = new Error("Empty Anthropic response");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Anthropic failed");
}

async function complete({ system, user, maxTokens = 900 }) {
  return enqueue(() => completeNow({ system, user, maxTokens }));
}

async function completeNow({ system, user, maxTokens }) {
  const errors = [];
  const configured = configuredProviders();

  if (!configured.spacexai && !configured.openai && !configured.gemini && !configured.anthropic) {
    throw new Error(
      "No cloud LLM key is set. Set XAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY."
    );
  }

  if (configured.spacexai && Date.now() >= spacexaiSkipUntil) {
    try {
      const result = await callOpenAICompatible({
        apiKey: process.env.XAI_API_KEY,
        baseURL: XAI_BASE,
        model: process.env.XAI_MODEL || "grok-4.6",
        system,
        user,
        maxTokens,
        label: "spacexai"
      });
      return { ...result, provider: "spacexai" };
    } catch (err) {
      const classified = classify(err);
      if (classified.invalidKey) spacexaiSkipUntil = Date.now() + 6 * 60 * 60 * 1000;
      errors.push(`spacexai: ${classified.invalidKey ? "invalid key" : String(err.message || "failed").slice(0, 120)}`);
    }
  }

  if (configured.gemini) {
    try {
      const result = await callGemini({ system, user, maxTokens });
      return { ...result, provider: "gemini" };
    } catch (err) {
      errors.push("gemini: quota or unavailable");
    }
  }

  if (configured.anthropic) {
    try {
      const result = await callAnthropic({ system, user, maxTokens });
      return { ...result, provider: "anthropic" };
    } catch (err) {
      errors.push("anthropic: failed");
    }
  }

  if (configured.openai && Date.now() >= openaiSkipUntil) {
    try {
      const result = await callOpenAICompatible({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        system,
        user,
        maxTokens,
        label: "openai"
      });
      return { ...result, provider: "openai" };
    } catch (err) {
      const classified = classify(err);
      if (classified.noCredits) openaiSkipUntil = Date.now() + 6 * 60 * 60 * 1000;
      errors.push("openai: no credits");
    }
  }

  const pauseMs = Math.max(pauseUntil - Date.now(), 20000);
  pauseUntil = Date.now() + pauseMs;
  throw new LlmPauseError(
    pauseMs,
    "Cloud LLMs are rate-limited or out of credits. Jobs will retry. Add Google AI billing, OpenAI credits, or XAI_API_KEY."
  );
}

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[\[{]/);
  if (start < 0) return null;
  const sliced = raw.slice(start);
  try {
    return JSON.parse(sliced);
  } catch {
    const endObj = sliced.lastIndexOf("}");
    const endArr = sliced.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (end > 0) {
      try {
        return JSON.parse(sliced.slice(0, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function completeJson({ system, user, maxTokens = 900 }) {
  const result = await complete({
    system: `${system}\n\nReturn valid JSON only. No markdown.`,
    user,
    maxTokens
  });
  const parsed = extractJson(result.text);
  return { ...result, json: parsed };
}

async function askAgent007({ prompt }) {
  return complete({
    system:
      "You are AGENT007, the orchestrator of an AI company. Be concrete, operational, and concise.",
    user: prompt
  });
}

function isPaused() {
  return Date.now() < pauseUntil;
}

function pauseRemainingMs() {
  return Math.max(0, pauseUntil - Date.now());
}

module.exports = {
  complete,
  completeJson,
  extractJson,
  askAgent007,
  askHermes: askAgent007,
  providerStatus,
  LlmPauseError,
  isPaused,
  pauseRemainingMs
};
