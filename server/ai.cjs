const { OpenAI } = require("openai");

const XAI_BASE = "https://api.x.ai/v1";
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 45000);
const MIN_GAP_MS = Number(process.env.LLM_MIN_GAP_MS || 2500);

const skippedModels = new Map();
const skipProviderUntil = new Map();
let openaiSkipUntil = 0;
let spacexaiSkipUntil = 0;
let pauseUntil = 0;
let lastCallAt = 0;
let chain = Promise.resolve();

const FREE_SIGNUP = [
  { id: "groq", env: "GROQ_API_KEY", label: "Groq", signup: "https://console.groq.com/keys", region: "US", card: false, note: "Best free speed. ~1,000–14,400 req/day." },
  { id: "openrouter", env: "OPENROUTER_API_KEY", label: "OpenRouter", signup: "https://openrouter.ai/keys", region: "US aggregator", card: false, note: "Many countries' models with :free suffix. 50 req/day." },
  { id: "cerebras", env: "CEREBRAS_API_KEY", label: "Cerebras", signup: "https://cloud.cerebras.ai", region: "US", card: false, note: "Very fast Llama/Qwen free tier." },
  { id: "mistral", env: "MISTRAL_API_KEY", label: "Mistral", signup: "https://console.mistral.ai/api-keys", region: "France", card: false, note: "EU free experimentation tier." },
  { id: "deepseek", env: "DEEPSEEK_API_KEY", label: "DeepSeek", signup: "https://platform.deepseek.com/api_keys", region: "China", card: false, note: "Signup credits, then cheap pay-as-you-go." },
  { id: "together", env: "TOGETHER_API_KEY", label: "Together", signup: "https://api.together.xyz/settings/api-keys", region: "US", card: false, note: "Open models, signup credits." },
  { id: "nvidia", env: "NVIDIA_API_KEY", label: "NVIDIA NIM", signup: "https://build.nvidia.com", region: "US", card: false, note: "Free eval, ~40 RPM." }
];

function catalog() {
  const extra = [];
  try {
    if (process.env.LLM_EXTRA_JSON) extra.push(...JSON.parse(process.env.LLM_EXTRA_JSON));
  } catch {
    /* ignore bad JSON */
  }
  if (process.env.OPENAI_COMPAT_BASE_URL) {
    extra.push({
      id: process.env.OPENAI_COMPAT_ID || "custom",
      env: "OPENAI_COMPAT_API_KEY",
      baseURL: process.env.OPENAI_COMPAT_BASE_URL,
      models: [process.env.OPENAI_COMPAT_MODEL || "gpt-4o-mini"]
    });
  }
  return [
    {
      id: "spacexai",
      env: "XAI_API_KEY",
      baseURL: XAI_BASE,
      models: [process.env.XAI_MODEL || "grok-4.6"]
    },
    {
      id: "groq",
      env: "GROQ_API_KEY",
      baseURL: "https://api.groq.com/openai/v1",
      models: [process.env.GROQ_MODEL || "openai/gpt-oss-120b", "llama-3.3-70b-versatile"]
    },
    {
      id: "cerebras",
      env: "CEREBRAS_API_KEY",
      baseURL: "https://api.cerebras.ai/v1",
      models: [process.env.CEREBRAS_MODEL || "llama3.1-8b"]
    },
    {
      id: "mistral",
      env: "MISTRAL_API_KEY",
      baseURL: "https://api.mistral.ai/v1",
      models: [process.env.MISTRAL_MODEL || "mistral-small-latest"]
    },
    {
      id: "deepseek",
      env: "DEEPSEEK_API_KEY",
      baseURL: "https://api.deepseek.com/v1",
      models: [process.env.DEEPSEEK_MODEL || "deepseek-chat"]
    },
    {
      id: "openrouter",
      env: "OPENROUTER_API_KEY",
      baseURL: "https://openrouter.ai/api/v1",
      models: [process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free"],
      headers: {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:4010",
        "X-Title": "AGENT007"
      }
    },
    {
      id: "together",
      env: "TOGETHER_API_KEY",
      baseURL: "https://api.together.xyz/v1",
      models: [process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo"]
    },
    {
      id: "nvidia",
      env: "NVIDIA_API_KEY",
      baseURL: "https://integrate.api.nvidia.com/v1",
      models: [process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct"]
    },
    {
      id: "github",
      env: process.env.GITHUB_MODELS_TOKEN ? "GITHUB_MODELS_TOKEN" : "GITHUB_TOKEN",
      baseURL: "https://models.github.ai/inference",
      models: [process.env.GITHUB_MODEL || "gpt-4o-mini"]
    },
    ...extra
  ];
}

function providerReady(p) {
  const key = p.env ? process.env[p.env] : "";
  if (!key) return false;
  const until = skipProviderUntil.get(p.id) || 0;
  return Date.now() >= until;
}

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
  const out = {
    spacexai: Boolean(process.env.XAI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY)
  };
  for (const p of catalog()) out[p.id] = Boolean(p.env && process.env[p.env]);
  return out;
}

function activeProvider() {
  const now = Date.now();
  for (const p of catalog()) {
    if (p.id === "spacexai" && now < spacexaiSkipUntil) continue;
    if (providerReady(p)) return p.id;
  }
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY && now >= openaiSkipUntil) return "openai";
  return null;
}

function providerStatus() {
  const now = Date.now();
  const configured = configuredProviders();
  return {
    mode: "cloud",
    active: activeProvider(),
    configured,
    paused: now < pauseUntil,
    resumeAt: now < pauseUntil ? new Date(pauseUntil).toISOString() : null,
    missingFree: FREE_SIGNUP.filter((s) => !process.env[s.env]),
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

async function callOpenAICompatible({ apiKey, baseURL, model, system, user, maxTokens, label, headers }) {
  const client = new OpenAI({
    apiKey: apiKey || "sk-none",
    baseURL,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 0,
    defaultHeaders: headers || undefined
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

async function tryCompat(p, { system, user, maxTokens }) {
  const key = p.env ? process.env[p.env] : "";
  if (!key) return null;
  if ((skipProviderUntil.get(p.id) || 0) > Date.now()) return null;
  const models = (p.models || []).filter(Boolean);
  let lastErr = null;
  for (const model of models) {
    try {
      await respectGap();
      const result = await callOpenAICompatible({
        apiKey: key,
        baseURL: p.baseURL,
        model,
        system,
        user,
        maxTokens,
        label: `${p.id}:${model}`,
        headers: p.headers
      });
      return { ...result, provider: p.id };
    } catch (err) {
      lastErr = err;
      const classified = classify(err);
      if (classified.invalidKey || classified.noCredits) {
        skipProviderUntil.set(p.id, Date.now() + 6 * 60 * 60 * 1000);
        if (p.id === "spacexai") spacexaiSkipUntil = Date.now() + 6 * 60 * 60 * 1000;
        break;
      }
      if (classified.rateLimited || classified.daily) {
        skipProviderUntil.set(p.id, Date.now() + classified.retryMs);
        break;
      }
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function completeNow({ system, user, maxTokens }) {
  const errors = [];
  const configured = configuredProviders();
  const hasAny =
    Object.values(configured).some(Boolean) ||
    Boolean(process.env.OPENAI_COMPAT_BASE_URL);

  if (!hasAny) {
    throw new Error(
      "No cloud LLM key is set. Add GROQ_API_KEY (free, no card) or OPENROUTER_API_KEY, or XAI_API_KEY."
    );
  }

  for (const p of catalog()) {
    if (!providerReady(p)) continue;
    try {
      const result = await tryCompat(p, { system, user, maxTokens });
      if (result) return result;
    } catch (err) {
      const classified = classify(err);
      errors.push(
        `${p.id}: ${classified.invalidKey ? "invalid key" : classified.noCredits ? "no credits" : classified.rateLimited ? "quota" : "failed"}`
      );
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
    "Cloud LLMs are rate-limited or out of credits. Add a free Groq or OpenRouter key, or a working XAI_API_KEY."
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
