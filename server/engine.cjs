const crypto = require("crypto");
const ai = require("./ai.cjs");
const stripeSvc = require("./stripeSvc.cjs");

const Agent = require("./models/Agent.cjs");
const Task = require("./models/Task.cjs");
const ActivityEvent = require("./models/ActivityEvent.cjs");
const Lead = require("./models/Lead.cjs");
const Approval = require("./models/Approval.cjs");
const Notification = require("./models/Notification.cjs");
const Offer = require("./models/Offer.cjs");
const Mission = require("./models/Mission.cjs");
const WorkspaceMessage = require("./models/WorkspaceMessage.cjs");
const RevenueEvent = require("./models/RevenueEvent.cjs");
const Site = require("./models/Site.cjs");
const appBuilder = require("./appBuilder.cjs");

const subscribers = new Set();
let running = 0;
const MAX_CONCURRENT = 1;
let tickTimer = null;
let syncTimer = null;

const DEPARTMENTS = [
  { name: "Acquisition", icon: "◉", key: "ACQUISITION" },
  { name: "Marketing", icon: "✦", key: "MARKETING" },
  { name: "Sales", icon: "↗", key: "SALES" },
  { name: "Clients", icon: "◎", key: "CLIENTS" },
  { name: "Finance", icon: "$", key: "FINANCE" },
  { name: "Growth", icon: "⌁", key: "GROWTH" },
  { name: "Technology", icon: "⌘", key: "TECHNOLOGY" },
  { name: "Strategy", icon: "◇", key: "STRATEGY" }
];

const ROLES = [
  ["Lead Hunter", "Acquisition", ["research", "lead-generation", "qualification"]],
  ["Market Researcher", "Acquisition", ["research", "market-analysis"]],
  ["ICP Analyst", "Acquisition", ["research", "segmentation"]],
  ["SEO Strategist", "Marketing", ["seo", "keyword-research", "analytics"]],
  ["Content Architect", "Marketing", ["content", "copywriting", "strategy"]],
  ["Social Agent", "Marketing", ["social", "content", "analytics"]],
  ["Campaign Agent", "Marketing", ["campaigns", "analytics", "optimization"]],
  ["Sales Qualifier", "Sales", ["qualification", "crm", "research"]],
  ["Offer Architect", "Sales", ["offers", "copywriting", "conversion"]],
  ["Sales Agent", "Sales", ["sales", "crm", "follow-up"]],
  ["CRM Agent", "Sales", ["crm", "data-management"]],
  ["Customer Success", "Clients", ["customer-success", "retention"]],
  ["Support Agent", "Clients", ["support", "knowledge-search"]],
  ["Retention Agent", "Clients", ["retention", "customer-health"]],
  ["Bookkeeper", "Finance", ["accounting", "reconciliation"]],
  ["Invoice Agent", "Finance", ["invoicing", "accounts-receivable"]],
  ["Finance Analyst", "Finance", ["forecasting", "analytics", "stripe"]],
  ["Growth Analyst", "Growth", ["analytics", "experimentation"]],
  ["Funnel Agent", "Growth", ["conversion", "funnels", "optimization"]],
  ["CRO Agent", "Growth", ["cro", "experimentation"]],
  ["Developer Agent", "Technology", ["javascript", "backend", "frontend"]],
  ["QA Agent", "Technology", ["testing", "quality-assurance"]],
  ["DevOps Agent", "Technology", ["docker", "kubernetes", "deployment"]],
  ["Security Agent", "Technology", ["security", "audit"]],
  ["Strategy Agent", "Strategy", ["strategy", "planning", "analysis"]]
];

const MONEY_ACTION_RE =
  /\b(send money|wire funds|issue (a )?refund|payout to|charge the (card|customer)|send (an |the )?email to|delete (this |the )?(offer|customer|account))\b/i;

function uid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function toClient(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === "function") return doc.toObject();
  return doc;
}

async function emit(type, payload = {}) {
  const item = {
    id: uid(),
    type,
    message: payload.message || payload.objective || payload.action || type,
    payload,
    timestamp: new Date()
  };

  try {
    await ActivityEvent.create(item);
  } catch (err) {
    console.error("activity persist failed", err.message);
  }

  const data = `data: ${JSON.stringify({
    id: item.id,
    type,
    timestamp: item.timestamp.toISOString(),
    ...payload
  })}\n\n`;

  for (const res of subscribers) {
    try {
      res.write(data);
    } catch {
      subscribers.delete(res);
    }
  }
  return item;
}

async function notify({ type, title, body, link = "", meta = {} }) {
  const item = {
    id: uid(),
    type,
    title,
    body,
    link,
    read: false,
    meta
  };
  await Notification.create(item);
  await emit("NOTIFICATION", { ...item, message: title });
  return item;
}

function addSubscriber(res) {
  subscribers.add(res);
  return () => subscribers.delete(res);
}

function requiresApproval(text, forceFinancial = false) {
  if (forceFinancial) return true;
  return MONEY_ACTION_RE.test(String(text));
}

async function findAgentForTask(objective, preferredDepartment) {
  const text = String(objective).toLowerCase();
  if (
    !preferredDepartment &&
    /\b(website|landing page|web app|microsite|html page|homepage|react|vite|fullstack|full.stack)\b/i.test(objective)
  ) {
    preferredDepartment = "Technology";
  }
  const query = {};
  if (preferredDepartment) {
    query.department = new RegExp(`^${preferredDepartment}$`, "i");
  }
  let pool = await Agent.find(query).sort({ status: 1, number: 1 }).limit(40).lean();
  if (!pool.length && preferredDepartment) {
    pool = await Agent.find({}).sort({ number: 1 }).limit(40).lean();
  }
  if (!pool.length) return null;

  if (/\b(website|landing page|web app|html|react|vite|fullstack)\b/i.test(objective)) {
    const builder = pool.find((a) => /developer/i.test(a.role || a.name || ""));
    if (builder) return builder;
  }
  let best = pool.find((a) =>
    (a.skills || []).some((skill) => text.includes(String(skill).toLowerCase()))
  );
  if (!best) {
    best = pool.find((a) => a.status === "IDLE") || pool[0];
  }
  return best;
}

async function createApproval({ type, title, summary, taskId, agentId, agent, payload }) {
  const approval = await Approval.create({
    id: uid(),
    type,
    title,
    summary,
    taskId,
    agentId,
    agent,
    payload,
    status: "AWAITING_APPROVAL"
  });

  await emit("APPROVAL.REQUIRED", {
    approvalId: approval.id,
    taskId,
    agent,
    objective: title,
    message: summary
  });

  await notify({
    type: "approval",
    title: "Human approval required",
    body: summary || title,
    link: "APPROVALS",
    meta: { approvalId: approval.id }
  });

  return approval;
}

async function createTask({ objective, missionId = null, department = null, agentId = null, mode = null }) {
  const agent = agentId
    ? await Agent.findOne({ id: agentId }).lean()
    : await findAgentForTask(objective, department);

  if (!agent) throw new Error("No agents available");

  const resolvedMode = mode || (requiresApproval(objective) ? "human-approval" : "autonomous");
  const item = {
    id: uid(),
    objective,
    title: objective,
    missionId,
    parentId: missionId,
    agentId: agent.id,
    agent: agent.name,
    assignedAgent: agent.id,
    department: agent.department,
    status: resolvedMode === "human-approval" ? "AWAITING_APPROVAL" : "QUEUED",
    mode: resolvedMode,
    artifacts: []
  };

  await Task.create(item);
  await Agent.updateOne(
    { id: agent.id },
    { status: item.status === "AWAITING_APPROVAL" ? "REVIEW" : "QUEUED", currentTask: objective }
  );

  await emit("TASK.CREATED", {
    taskId: item.id,
    agentId: agent.id,
    agent: agent.name,
    objective,
    department: agent.department,
    message: `${agent.name} received: ${objective}`
  });

  if (resolvedMode === "human-approval") {
    await createApproval({
      type: "task.execute",
      title: objective,
      summary: `${agent.name} needs approval before: ${objective}`,
      taskId: item.id,
      agentId: agent.id,
      agent: agent.name,
      payload: { objective }
    });
  }

  return item;
}

function extractOffers(text) {
  const parsed = ai.extractJson(text);
  const bag = [];
  const push = (o) => {
    if (!o || typeof o !== "object") return;
    const name = o.name || o.title;
    const amountCents =
      o.amountCents ||
      (typeof o.price === "number" ? Math.round(o.price * (o.price < 1000 ? 100 : 1)) : null) ||
      (typeof o.amount === "number" ? Math.round(o.amount * (o.amount < 1000 ? 100 : 1)) : null);
    if (!name || !amountCents) return;
    bag.push({
      name: String(name).slice(0, 80),
      description: String(o.description || "").slice(0, 500),
      amountCents: Math.max(100, Number(amountCents)),
      interval: o.interval === "month" || o.recurring ? "month" : "one_time"
    });
  };
  if (Array.isArray(parsed)) parsed.forEach(push);
  else if (parsed?.offers) (Array.isArray(parsed.offers) ? parsed.offers : [parsed.offers]).forEach(push);
  else if (parsed?.offer) push(parsed.offer);
  else if (parsed?.name && (parsed.amountCents || parsed.price || parsed.amount)) push(parsed);
  return bag;
}

function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `site-${uid().slice(0, 8)}`;
}

function extractHtml(text) {
  if (!text) return "";
  const fenced = text.match(/```html\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (start >= 0) return text.slice(start).trim();
  return "";
}

function asDocument(html, title) {
  if (/<html[\s>]/i.test(html)) return html;
  const safeTitle = String(title || "AGENT007 site")
    .replace(/</g, "")
    .slice(0, 80);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font-family:Inter,system-ui,sans-serif; background:#070910; color:#eef2ff; }
    main { max-width:880px; margin:0 auto; padding:48px 20px 80px; }
    a { color:#9d95ff; }
  </style>
</head>
<body>
  <main>${html}</main>
</body>
</html>`;
}

async function publishSite({ title, summary, html, agent, taskId, offerId, kind, files, bundleJs, slug }) {
  slug = slug || slugify(title);
  const taken = await Site.findOne({ slug }).lean();
  if (taken) slug = `${slug}-${uid().slice(0, 6)}`;
  const site = await Site.create({
    id: uid(),
    slug,
    title: String(title).slice(0, 80),
    summary: String(summary || "").slice(0, 400),
    html: kind === "react-vite" ? html : asDocument(html, title),
    kind: kind || "html",
    files: files || [],
    bundleJs: bundleJs || "",
    status: "live",
    agentId: agent.id,
    agent: agent.name,
    taskId,
    offerId: offerId || "",
    url: `/w/${slug}`
  });
  return site;
}

async function executeTask(task) {
  const agent = await Agent.findOne({ id: task.agentId });
  if (!agent) {
    await Task.updateOne({ id: task.id }, { status: "FAILED", error: "Agent missing" });
    return;
  }

  await Task.updateOne({ id: task.id }, { status: "RUNNING" });
  await Agent.updateOne({ id: agent.id }, { status: "WORKING", currentTask: task.objective });
  await emit("AGENT.WORKING", {
    taskId: task.id,
    agentId: agent.id,
    agent: agent.name,
    department: agent.department,
    action: task.objective,
    message: `${agent.name} is working on: ${task.objective}`
  });

  const recent = await WorkspaceMessage.find({ agentId: agent.id })
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();
  const memory = recent
    .reverse()
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(-2500);

  let stripeContext = "";
  if (/stripe|revenue|mrr|finance|invoice|payout/i.test(task.objective) || agent.department === "Finance") {
    try {
      const metrics = await stripeSvc.getMetrics();
      stripeContext = `\nLive Stripe (mode=${metrics.mode}): available $${metrics.balance?.available ?? "n/a"}, pending $${metrics.balance?.pending ?? "n/a"}, MRR $${metrics.mrr ?? 0}, today $${metrics.dailyRevenue ?? 0}, failed charges today ${metrics.failedToday ?? 0}, chargesEnabled=${metrics.account?.chargesEnabled}.`;
    } catch (err) {
      stripeContext = `\nStripe metrics unavailable: ${err.message}`;
    }
  }

  const wantsApp = /\b(react|vite|fullstack|full.stack|web app|spa)\b/i.test(task.objective);
  const wantsSite = wantsApp
    || /\b(website|landing|web app|microsite|html|homepage|page)\b/i.test(task.objective)
    || agent.department === "Technology";
  const system = `You are ${agent.name}, a ${agent.role} on the ${agent.department} team of AGENT007 AI Company OS.
Skills: ${(agent.skills || []).join(", ")}.
You produce real, usable work — not theater.
If you recommend something to sell, include JSON:
{"offers":[{"name":"...","description":"...","amountCents":4900,"interval":"one_time"|"month"}]}
If the task is a React, Vite, fullstack, or web app: return a Vite+React project as fenced files (path on the fence language line) plus JSON {"app":{"title":"...","summary":"..."}}.
Required files: src/App.jsx, src/main.jsx, src/style.css. Use React hooks. For data, import { api } from "./agent007" and call api.list("items") / api.save("items", row). That is the real backend. Do not invent other servers. Keep App.jsx complete and runnable.
If the task is only a static landing page, return a full HTML document in a html fence plus {"sites":[{"title":"...","summary":"..."}]}.
Do not claim you charged a card. Stripe only after human approval.
Company: AGENT007 ships live React/Vite apps and websites.`;

  const user = `Task: ${task.objective}
${stripeContext}
Recent workspace:
${memory || "(empty)"}`;

  try {
    const result = await ai.complete({ system, user, maxTokens: wantsApp ? 5500 : wantsSite ? 3500 : 900 });
    const artifacts = [];
    const offers = extractOffers(result.text);

    for (const offer of offers) {
      const draft = await Offer.create({
        id: uid(),
        ...offer,
        status: "pending_approval",
        agentId: agent.id,
        agent: agent.name
      });
      artifacts.push({ type: "offer", offerId: draft.id, name: draft.name, amountCents: draft.amountCents });
      await createApproval({
        type: "stripe.publish_offer",
        title: `Publish offer: ${draft.name}`,
        summary: `${agent.name} prepared "${draft.name}" at $${(draft.amountCents / 100).toFixed(2)}${draft.interval === "month" ? "/mo" : ""}. Approve to create a live Stripe Payment Link that deposits into your Stripe account.`,
        taskId: task.id,
        agentId: agent.id,
        agent: agent.name,
        payload: { offerId: draft.id }
      });
    }

    const parsed = ai.extractJson(result.text) || {};
    const extracted = appBuilder.extractAppFiles(result.text, parsed);
    const hasReact = extracted.some((f) => /src\/App\.(jsx|js|tsx)$/.test(f.path)) || wantsApp;
    if (hasReact && (extracted.length || wantsApp)) {
      const meta = parsed.app || parsed.site || {};
      const title = meta.title || task.objective.slice(0, 60);
      let slug = slugify(title);
      if (await Site.findOne({ slug }).lean()) slug = `${slug}-${uid().slice(0, 6)}`;
      const files = appBuilder.mergeFiles(extracted, slug, title);
      try {
        const built = await appBuilder.compileReact(files);
        const site = await publishSite({
          title,
          summary: meta.summary || "Vite + React app",
          html: appBuilder.spaShell({ title, slug, css: built.css }),
          agent,
          taskId: task.id,
          offerId: artifacts.find((a) => a.type === "offer")?.offerId,
          kind: "react-vite",
          files,
          bundleJs: built.js,
          slug
        });
        artifacts.push({ type: "app", siteId: site.id, slug: site.slug, url: site.url, title: site.title, kind: "react-vite" });
        await emit("SITE.PUBLISHED", {
          siteId: site.id,
          slug: site.slug,
          url: site.url,
          agent: agent.name,
          message: `${agent.name} shipped a React/Vite app: ${site.url}`
        });
        await notify({
          type: "revenue",
          title: "Live React app shipped",
          body: `${site.title} is up at ${site.url} (downloadable Vite project)`,
          link: "SITES"
        });
      } catch (buildErr) {
        artifacts.push({ type: "build-error", error: String(buildErr.message || buildErr).slice(0, 300) });
      }
    } else {
      const html = extractHtml(result.text);
      if (html) {
        const meta = Array.isArray(parsed.sites) ? parsed.sites[0] : parsed.site || parsed.sites || {};
        const site = await publishSite({
          title: meta.title || task.objective.slice(0, 60),
          summary: meta.summary || result.text.slice(0, 240),
          html,
          agent,
          taskId: task.id,
          offerId: artifacts.find((a) => a.type === "offer")?.offerId
        });
        artifacts.push({ type: "site", siteId: site.id, slug: site.slug, url: site.url, title: site.title });
        await emit("SITE.PUBLISHED", {
          siteId: site.id,
          slug: site.slug,
          url: site.url,
          agent: agent.name,
          message: `${agent.name} shipped a live site: ${site.url}`
        });
        await notify({
          type: "revenue",
          title: "Live website shipped",
          body: `${site.title} is up at ${site.url}`,
          link: "SITES"
        });
      }
    }

    await WorkspaceMessage.create({
      id: uid(),
      agentId: agent.id,
      taskId: task.id,
      role: "agent",
      content: result.text,
      artifacts
    });

    await Task.updateOne(
      { id: task.id },
      {
        status: "COMPLETED",
        result: result.text,
        artifacts,
        error: null,
        provider: result.provider
      }
    );
    await Agent.updateOne(
      { id: agent.id },
      {
        status: "IDLE",
        currentTask: null,
        lastOutput: result.text.slice(0, 2000),
        $inc: { tasksCompleted: 1, efficiency: offers.length ? 1 : 0 }
      }
    );

    await emit("TASK.COMPLETED", {
      taskId: task.id,
      agentId: agent.id,
      agent: agent.name,
      result: result.text.slice(0, 400),
      provider: result.provider,
      message: `${agent.name} completed: ${task.objective}`
    });

    if (task.missionId) {
      const remaining = await Task.countDocuments({
        missionId: task.missionId,
        status: { $nin: ["COMPLETED", "REJECTED", "FAILED"] }
      });
      const total = await Task.countDocuments({ missionId: task.missionId });
      const done = total - remaining;
      const progress = total ? Math.round((done / total) * 100) : 100;
      await Mission.updateOne(
        { id: task.missionId },
        { progress, status: remaining === 0 ? "COMPLETE" : "ACTIVE" }
      );
    }
  } catch (err) {
    const pause = err && (err.code === "LLM_PAUSE" || err.name === "LlmPauseError");
    const friendly = pause
      ? err.friendly || err.message
      : String(err.message || err).slice(0, 220);

    if (pause) {
      await Task.updateOne(
        { id: task.id },
        { status: "QUEUED", error: friendly, mode: "autonomous" }
      );
      await Agent.updateOne({ id: agent.id }, { status: "QUEUED", currentTask: task.objective });
      await emit("LLM.PAUSED", {
        taskId: task.id,
        agent: agent.name,
        message: friendly
      });
      await maybeNotifyQuota(friendly);
      return;
    }

    await Task.updateOne({ id: task.id }, { status: "FAILED", error: friendly });
    await Agent.updateOne({ id: agent.id }, { status: "IDLE", currentTask: null });
    await WorkspaceMessage.create({
      id: uid(),
      agentId: agent.id,
      taskId: task.id,
      role: "system",
      content: `Task failed: ${friendly}`
    });
    await emit("TASK.FAILED", {
      taskId: task.id,
      agentId: agent.id,
      agent: agent.name,
      error: friendly,
      message: `${agent.name} failed: ${friendly}`
    });
    await notify({
      type: "error",
      title: "Agent task failed",
      body: `${agent.name}: ${friendly}`,
      link: "ACTIVITY"
    });
  }
}

let lastQuotaNotify = 0;

async function maybeNotifyQuota(body) {
  const now = Date.now();
  if (now - lastQuotaNotify < 10 * 60 * 1000) return;
  lastQuotaNotify = now;
  await notify({
    type: "error",
    title: "LLM quota pause",
    body,
    link: "ACTIVITY"
  });
}

async function tick() {
  if (running >= MAX_CONCURRENT) return;
  if (ai.isPaused && ai.isPaused()) return;
  running += 1;
  try {
    const task = await Task.findOneAndUpdate(
      { status: "QUEUED" },
      { status: "CLAIMED" },
      { sort: { createdAt: 1 }, returnDocument: "after" }
    );
    if (!task) return;
    await executeTask(task);
  } finally {
    running -= 1;
  }
}

async function buildPlan(objective) {
  try {
    const planned = await ai.completeJson({
      system: `You are AGENT007, an AI company orchestrator. Decompose a business objective into at most 3 concrete tasks for specialist agents.
If the owner wants a website, landing page, React, Vite, or fullstack app, include a Technology task that ships a complete product (React/Vite when they asked for an app).
Return JSON: {"name":"short mission name","plan":["step",...],"tasks":[{"objective":"...","department":"Sales|Marketing|Finance|Acquisition|Clients|Growth|Technology|Strategy","requiresApproval":false}]}
Departments must be one of those listed. requiresApproval=true for money movement, publishing, emails, refunds, Stripe writes.`,
      user: objective,
      maxTokens: 900
    });
    if (planned.json?.tasks?.length) return planned.json;
  } catch (err) {
    console.warn("plan via LLM failed, using fallback", err.message);
  }

  const text = objective.toLowerCase();
  if (text.includes("revenue") || text.includes("mrr") || text.includes("sell") || text.includes("stripe")) {
    return {
      name: "Revenue engine",
      plan: [
        "Analyze live Stripe balance and failed charges",
        "Define a sellable offer with price and copy",
        "Prepare Stripe Payment Link for human approval",
        "Write outreach and checkout positioning",
        "Report expected cash impact"
      ],
      tasks: [
        { objective: "Analyze live Stripe balance, payouts, and failed charges", department: "Finance", requiresApproval: false },
        { objective: "Design a priced offer that can be sold via Stripe Payment Link", department: "Sales", requiresApproval: false },
        { objective: "Write landing copy and checkout positioning for the offer", department: "Marketing", requiresApproval: false },
        { objective: "Recommend a 14-day revenue plan with target MRR", department: "Strategy", requiresApproval: false }
      ]
    };
  }

  return {
    name: objective.slice(0, 48),
    plan: ["Understand objective", "Do the specialist work", "Verify result", "Report to AGENT007"],
    tasks: [
      { objective, department: null, requiresApproval: requiresApproval(objective) }
    ]
  };
}

async function delegateObjective(objective) {
  const planned = await buildPlan(objective);
  const mission = await Mission.create({
    id: uid(),
    name: planned.name || objective.slice(0, 64),
    objective,
    target: planned.target || "",
    status: "ACTIVE",
    progress: 4,
    plan: planned.plan || [],
    taskIds: [],
    agents: planned.tasks?.length || 0
  });

  await emit("AGENT007.OBJECTIVE", {
    missionId: mission.id,
    objective,
    plan: mission.plan,
    message: `AGENT007 accepted: ${objective}`
  });

  const taskIds = [];
  for (const step of (planned.tasks || []).slice(0, 3)) {
    const task = await createTask({
      objective: step.objective,
      missionId: mission.id,
      department: step.department,
      mode: step.requiresApproval ? "human-approval" : "autonomous"
    });
    taskIds.push(task.id);
  }
  await Mission.updateOne({ id: mission.id }, { taskIds, agents: taskIds.length });
  return (await Mission.findOne({ id: mission.id }).lean()) || mission;
}

async function chatWithAgent(agentId, content) {
  const agent = await Agent.findOne({ id: agentId });
  if (!agent) throw new Error("Agent not found");

  await WorkspaceMessage.create({
    id: uid(),
    agentId,
    role: "user",
    content
  });

  const history = await WorkspaceMessage.find({ agentId }).sort({ createdAt: -1 }).limit(10).lean();
  const transcript = history
    .reverse()
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(-6000);

  const result = await ai.complete({
    system: `You are ${agent.name}, ${agent.role} in ${agent.department}. This is your live workspace with the company owner. Be useful. If they ask you to do work that spends money or publishes, say you will queue it for approval.`,
    user: transcript || content,
    maxTokens: 1200
  });

  const msg = await WorkspaceMessage.create({
    id: uid(),
    agentId,
    role: "agent",
    content: result.text
  });

  const offers = extractOffers(result.text);
  for (const offer of offers) {
    const draft = await Offer.create({
      id: uid(),
      ...offer,
      status: "pending_approval",
      agentId: agent.id,
      agent: agent.name
    });
    await createApproval({
      type: "stripe.publish_offer",
      title: `Publish offer: ${draft.name}`,
      summary: `${agent.name} prepared "${draft.name}" at $${(draft.amountCents / 100).toFixed(2)}. Approve to create a Stripe Payment Link.`,
      agentId: agent.id,
      agent: agent.name,
      payload: { offerId: draft.id }
    });
  }

  await Agent.updateOne({ id: agentId }, { lastOutput: result.text.slice(0, 2000), status: "IDLE" });
  return { message: toClient(msg), provider: result.provider };
}

async function approve(id, actor = "admin") {
  const approval = await Approval.findOne({ id });
  if (!approval) throw new Error("Approval not found");
  if (approval.status !== "AWAITING_APPROVAL") throw new Error("Approval already decided");

  let result = null;
  if (approval.type === "stripe.publish_offer") {
    const offer = await Offer.findOne({ id: approval.payload.offerId });
    if (!offer) throw new Error("Offer not found");
    const published = await stripeSvc.publishOffer({
      name: offer.name,
      description: offer.description,
      amountCents: offer.amountCents,
      currency: offer.currency,
      interval: offer.interval
    });
    offer.status = "live";
    offer.stripeProductId = published.productId;
    offer.stripePriceId = published.priceId;
    offer.stripePaymentLinkId = published.paymentLinkId;
    offer.paymentUrl = published.paymentUrl;
    await offer.save();
    result = { paymentUrl: published.paymentUrl, livemode: published.livemode, offerId: offer.id };
    await notify({
      type: "revenue",
      title: "Stripe Payment Link is live",
      body: `${offer.name} → ${published.paymentUrl}`,
      link: "REVENUE",
      meta: result
    });
  } else if (approval.taskId) {
    await Task.updateOne({ id: approval.taskId }, { status: "QUEUED", mode: "autonomous" });
    const task = await Task.findOne({ id: approval.taskId }).lean();
    if (task?.agentId) {
      await Agent.updateOne({ id: task.agentId }, { status: "QUEUED" });
    }
  }

  approval.status = "APPROVED";
  approval.decidedBy = actor;
  approval.decidedAt = new Date();
  approval.result = result;
  await approval.save();

  await emit("APPROVAL.GRANTED", {
    approvalId: approval.id,
    taskId: approval.taskId,
    agent: approval.agent,
    objective: approval.title,
    result,
    message: `Approved: ${approval.title}`
  });

  return toClient(approval);
}

async function reject(id, actor = "admin") {
  const approval = await Approval.findOne({ id });
  if (!approval) throw new Error("Approval not found");
  approval.status = "REJECTED";
  approval.decidedBy = actor;
  approval.decidedAt = new Date();
  await approval.save();
  if (approval.payload?.offerId) {
    await Offer.updateOne({ id: approval.payload.offerId }, { status: "rejected" });
  }
  if (approval.taskId) {
    await Task.updateOne({ id: approval.taskId }, { status: "REJECTED" });
  }
  await emit("APPROVAL.REJECTED", {
    approvalId: approval.id,
    agent: approval.agent,
    objective: approval.title,
    message: `Rejected: ${approval.title}`
  });
  return toClient(approval);
}

async function recordStripeCharge(charge, extra = {}) {
  if (!charge?.id) return null;
  if (charge.status !== "succeeded" || !charge.paid) return null;
  const already = await RevenueEvent.findOne({ stripeId: charge.id }).lean();
  if (already) return already;
  try {
    const event = await RevenueEvent.findOneAndUpdate(
      { stripeId: charge.id },
      {
        id: charge.id,
        stripeId: charge.id,
        amountCents: charge.amount,
        currency: charge.currency,
        type: charge.invoice ? "recurring" : "sale",
        source: "stripe",
        status: "succeeded",
        customerEmail: extra.customerEmail || "",
        description: charge.description || extra.description || "",
        livemode: Boolean(charge.livemode),
        raw: { amount: charge.amount, status: charge.status }
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    if (extra.offerId) {
      await Offer.updateOne(
        { id: extra.offerId },
        { $inc: { sales: 1, revenueCents: charge.amount } }
      );
    }

    await emit("REVENUE.CREATED", {
      amount: charge.amount / 100,
      stripeId: charge.id,
      message: `Stripe collected $${(charge.amount / 100).toFixed(2)}`
    });
    await notify({
      type: "revenue",
      title: "Money received in Stripe",
      body: `$${(charge.amount / 100).toFixed(2)} ${String(charge.currency || "usd").toUpperCase()} · ${charge.description || charge.id}`,
      link: "REVENUE"
    });
    return event;
  } catch (err) {
    if (String(err.message).includes("duplicate")) return null;
    console.error("recordStripeCharge", err.message);
    return null;
  }
}

async function syncStripeRevenue() {
  if (!stripeSvc.isConfigured()) return { synced: 0, configured: false };
  const charges = await stripeSvc.recentSuccessfulCharges(40);
  let synced = 0;
  for (const charge of charges) {
    const existing = await RevenueEvent.findOne({ stripeId: charge.id }).lean();
    if (existing) continue;
    const recorded = await recordStripeCharge(charge);
    if (recorded) synced += 1;
  }
  return { synced, configured: true };
}

function roster() {
  return Array.from({ length: 300 }, (_, i) => {
    const role = ROLES[i % ROLES.length];
    return {
      id: `agent-${String(i + 1).padStart(3, "0")}`,
      number: i + 1,
      name: `${role[0]} #${String(i + 1).padStart(3, "0")}`,
      role: role[0],
      department: role[1],
      skills: role[2],
      status: "IDLE",
      efficiency: 78 + ((i * 11) % 22),
      tasksCompleted: 0,
      revenueAttributed: 0,
      currentTask: null,
      lastOutput: "",
      permissions: {
        research: true,
        draft: true,
        analyze: true,
        external_write: i % 5 === 0,
        financial_action: role[1] === "Finance" || role[0] === "Offer Architect"
      }
    };
  });
}

async function seed() {
  const list = roster();
  await Agent.bulkWrite(
    list.map((a) => ({
      updateOne: {
        filter: { id: a.id },
        update: {
          $set: {
            number: a.number,
            name: a.name,
            role: a.role,
            department: a.department,
            skills: a.skills,
            permissions: a.permissions
          },
          $setOnInsert: {
            id: a.id,
            status: "IDLE",
            efficiency: a.efficiency,
            tasksCompleted: 0,
            revenueAttributed: 0,
            currentTask: null,
            lastOutput: ""
          }
        },
        upsert: true
      }
    })),
    { ordered: false }
  );
  console.log(`Agents ready: ${await Agent.countDocuments()}`);

  const realTasks = await Task.countDocuments({ status: "COMPLETED" });
  if (realTasks === 0) {
    await Agent.updateMany(
      {},
      {
        $set: {
          tasksCompleted: 0,
          revenueAttributed: 0,
          status: "IDLE",
          currentTask: null
        }
      }
    );
  }

  const quotaFailed = await Task.find({
    status: "FAILED",
    error: { $regex: "quota|429|RESOURCE_EXHAUSTED|Cloud LLM|no credits|aborted|UNAVAILABLE|503|rate-limit", $options: "i" }
  }).lean();
  for (const task of quotaFailed) {
    await Task.updateOne({ id: task.id }, { status: "QUEUED", error: null });
    if (task.agentId) {
      await Agent.updateOne({ id: task.agentId }, { status: "QUEUED", currentTask: task.objective });
    }
    console.log(`Requeued quota-failed task ${task.id}`);
  }

  const stuck = await Task.find({ status: { $in: ["RUNNING", "CLAIMED"] } }).lean();
  for (const task of stuck) {
    await Task.updateOne({ id: task.id }, { status: "QUEUED", error: null });
    if (task.agentId) {
      await Agent.updateOne({ id: task.agentId }, { status: "QUEUED", currentTask: task.objective });
    }
    console.log(`Requeued in-flight task ${task.id}`);
  }

  const misqueued = await Task.find({ status: "AWAITING_APPROVAL" }).lean();
  for (const task of misqueued) {
    if (requiresApproval(task.objective)) continue;
    await Task.updateOne({ id: task.id }, { status: "QUEUED", mode: "autonomous", error: null });
    await Approval.updateMany(
      { taskId: task.id, status: "AWAITING_APPROVAL" },
      { status: "AUTO_RELEASED", decidedBy: "system", decidedAt: new Date() }
    );
    if (task.agentId) {
      await Agent.updateOne({ id: task.agentId }, { status: "QUEUED", currentTask: task.objective });
    }
    console.log(`Released misqueued task ${task.id} for autonomous run`);
  }

  if ((await Site.countDocuments({ slug: "agent007" })) === 0) {
    await Site.create({
      id: uid(),
      slug: "agent007",
      title: "AGENT007",
      summary: "AI company that builds live websites, apps, and digital products — then sells them on Stripe after you approve.",
      status: "live",
      agent: "AGENT007",
      url: "/w/agent007",
      html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AGENT007 — we ship live products</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, system-ui, sans-serif; background:#05070c; color:#edf1ff; }
    .wrap { max-width: 920px; margin: 0 auto; padding: 56px 22px 80px; }
    .mark { width:42px; height:42px; border-radius:12px; display:grid; place-items:center; background:linear-gradient(135deg,#756aff,#a97eff); font-weight:900; font-size:11px; letter-spacing:.4px; }
    .top { display:flex; gap:12px; align-items:center; letter-spacing:2px; font-size:13px; }
    .top small { display:block; color:#68748b; letter-spacing:1.5px; font-size:8px; margin-top:4px; }
    h1 { font-size: clamp(40px, 8vw, 72px); letter-spacing:-3px; line-height:.95; margin: 36px 0 16px; }
    h1 i { color:#9d95ff; font-style:normal; }
    p { color:#8b97ad; font-size:16px; line-height:1.7; max-width: 640px; }
    .row { display:grid; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-top:36px; }
    .card { background:#0b111c; border:1px solid #243049; border-radius:16px; padding:18px; }
    .card b { display:block; margin-bottom:8px; }
    .card span { color:#748096; font-size:13px; line-height:1.5; }
    a.btn { display:inline-block; margin-top:28px; background:#7b6cff; color:#fff; text-decoration:none; padding:12px 16px; border-radius:10px; font-size:12px; letter-spacing:1px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top"><div class="mark">007</div><div>AGENT007<small>LIVE PRODUCT</small></div></div>
    <h1>We don't sell a checkout.<br><i>We ship the thing.</i></h1>
    <p>Specialist agents design, write, and publish real websites and web apps. You get a public URL. If you want to charge for it, approve Stripe. Money lands in your Stripe account — not a fake counter.</p>
    <div class="row">
      <div class="card"><b>1. Delegate</b><span>Tell AGENT007 to build a landing page, a tool, or a product site.</span></div>
      <div class="card"><b>2. Live URL</b><span>The page is hosted at /w/your-product. Share it. Preview it. Iterate.</span></div>
      <div class="card"><b>3. Optional Stripe</b><span>Approve an offer only if you actually want a live payment link.</span></div>
    </div>
    <a class="btn" href="/store">SEE THE CATALOG →</a>
  </div>
</body>
</html>`
    });
    console.log("Seeded AGENT007 homepage at /w/agent007");
  }

  const missions = await Mission.countDocuments();
  if (missions === 0) {
    await Mission.insertMany([
      {
        id: uid(),
        name: "Stand up a real Stripe revenue engine",
        objective: "Create sellable offers, publish Payment Links after approval, and record live Stripe cash.",
        target: "First successful live payment",
        status: "ACTIVE",
        progress: 8,
        plan: [
          "Read live Stripe account health",
          "Draft priced offers",
          "Request approval to publish Payment Links",
          "Share links and record incoming charges"
        ],
        taskIds: [],
        agents: 0
      }
    ]);
  }
}

function start() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    tick().catch((err) => console.error("engine tick", err.message));
  }, 2500);
  syncTimer = setInterval(() => {
    syncStripeRevenue().catch((err) => console.error("stripe sync", err.message));
  }, 60000);
  setTimeout(() => {
    syncStripeRevenue().catch(() => {});
  }, 4000);
}

function departments() {
  return DEPARTMENTS;
}

module.exports = {
  DEPARTMENTS,
  departments,
  emit,
  notify,
  addSubscriber,
  createTask,
  createApproval,
  delegateObjective,
  chatWithAgent,
  approve,
  reject,
  recordStripeCharge,
  syncStripeRevenue,
  seed,
  start,
  uid,
  nowIso
};
