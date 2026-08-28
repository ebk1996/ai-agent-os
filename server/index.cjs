require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const auth = require("./auth.cjs");
const ai = require("./ai.cjs");
const stripeSvc = require("./stripeSvc.cjs");
const engine = require("./engine.cjs");

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
const AppRecord = require("./models/AppRecord.cjs");
const appBuilder = require("./appBuilder.cjs");

const app = express();
const PORT = Number(process.env.PORT || 4010);

app.use(cors({ origin: true, credentials: true }));
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const event = stripeSvc.constructWebhookEvent(
        req.body,
        req.headers["stripe-signature"]
      );
      if (event.type === "charge.succeeded") {
        await engine.recordStripeCharge(event.data.object);
      }
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        if (session.amount_total) {
          await engine.recordStripeCharge({
            id: session.payment_intent || session.id,
            amount: session.amount_total,
            currency: session.currency,
            status: "succeeded",
            paid: true,
            livemode: session.livemode,
            description: session.metadata?.offerName || "Checkout",
            invoice: session.mode === "subscription" ? session.invoice : null
          }, { customerEmail: session.customer_details?.email });
        }
      }
      res.json({ received: true });
    } catch (err) {
      console.error("webhook", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);
app.use(express.json({ limit: "2mb" }));

function publicPath(p) {
  return (
    p === "/api/health" ||
    p === "/api/admin/login" ||
    p === "/api/store" ||
    p.startsWith("/api/store/") ||
    p === "/api/sites" ||
    p.startsWith("/api/apps/") ||
    /^\/api\/sites\/[^/]+\/project\.zip$/.test(p) ||
    p === "/api/stripe/webhook"
  );
}

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  if (publicPath(req.path)) return next();
  if (req.path === "/api/events") return next();
  return auth.requireAuth(req, res, next);
});

app.get("/api/health", async (_req, res) => {
  const agents = await Agent.countDocuments().catch(() => 0);
  res.json({
    ok: true,
    system: "AGENT007",
    agents,
    status: mongoose.connection.readyState === 1 ? "ONLINE" : "DEGRADED",
    stripe: {
      configured: stripeSvc.isConfigured(),
      mode: stripeSvc.stripeMode()
    },
    llm: ai.providerStatus(),
    timestamp: new Date().toISOString()
  });
});

app.post("/api/admin/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (username !== auth.adminUsername()) {
    return res.status(401).json({ success: false, error: "Invalid admin credentials" });
  }
  const ok = await auth.verifyPassword(password);
  if (!ok) {
    return res.status(401).json({ success: false, error: "Invalid admin credentials" });
  }
  const token = auth.signToken(username);
  res.json({
    success: true,
    token,
    user: { username, role: "admin" }
  });
});

app.get("/api/admin/me", (req, res) => {
  res.json({ user: { username: req.user.sub, role: req.user.role } });
});

app.get("/api/company", async (_req, res) => {
  const [agents, missions, metrics, pending, unread, offers, leads] = await Promise.all([
    Agent.countDocuments(),
    Mission.find({}).sort({ createdAt: -1 }).limit(8).lean(),
    stripeSvc.getMetrics().catch((err) => ({ configured: false, error: err.message })),
    Approval.countDocuments({ status: "AWAITING_APPROVAL" }),
    Notification.countDocuments({ read: false }),
    Offer.countDocuments({ status: "live" }),
    Lead.countDocuments()
  ]);
  const working = await Agent.countDocuments({ status: { $in: ["WORKING", "QUEUED", "REVIEW"] } });
  res.json({
    name: "AI Company OS",
    orchestrator: "AGENT007",
    agents,
    working,
    departments: engine.departments(),
    missions,
    metrics,
    pendingApprovals: pending,
    unreadNotifications: unread,
    liveOffers: offers,
    leads,
    llm: ai.providerStatus()
  });
});

app.get("/api/metrics", async (_req, res) => {
  try {
    const metrics = await stripeSvc.getMetrics();
    const leads = await Lead.countDocuments();
    const attributed = await Agent.aggregate([
      { $group: { _id: null, total: { $sum: "$revenueAttributed" } } }
    ]);
    res.json({ ...metrics, leads, attributedRevenue: attributed[0]?.total || 0 });
  } catch (err) {
    res.status(500).json({
      configured: false,
      error: err.message,
      code: err.code || "STRIPE_ERROR"
    });
  }
});

app.get("/api/stripe/charges", async (_req, res) => {
  try {
    res.json(await stripeSvc.listCharges(30));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/stripe/customers", async (_req, res) => {
  try {
    res.json(await stripeSvc.listCustomers(30));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stripe/sync", async (_req, res) => {
  try {
    res.json(await engine.syncStripeRevenue());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/agents", async (req, res) => {
  const department = req.query.department;
  const query = {};
  if (department && department !== "ALL") {
    query.department = new RegExp(`^${department}$`, "i");
  }
  const agents = await Agent.find(query).sort({ number: 1 }).lean();
  res.json(agents);
});

app.get("/api/agents/:id", async (req, res) => {
  const agent = await Agent.findOne({ id: req.params.id }).lean();
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  const [messages, tasks] = await Promise.all([
    WorkspaceMessage.find({ agentId: agent.id }).sort({ createdAt: 1 }).limit(80).lean(),
    Task.find({ agentId: agent.id }).sort({ createdAt: -1 }).limit(30).lean()
  ]);
  res.json({ ...agent, messages, tasks });
});

app.post("/api/agents/:id/chat", async (req, res) => {
  try {
    const content = String(req.body.message || req.body.content || "").trim();
    if (!content) return res.status(400).json({ error: "message required" });
    const result = await engine.chatWithAgent(req.params.id, content);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/agents/:id/assign", async (req, res) => {
  try {
    const objective = String(req.body.task || req.body.objective || "").trim();
    if (!objective) return res.status(400).json({ error: "objective required" });
    const task = await engine.createTask({ objective, agentId: req.params.id });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/missions", async (_req, res) => {
  const missions = await Mission.find({}).sort({ createdAt: -1 }).limit(40).lean();
  res.json(missions);
});

app.get("/api/tasks", async (req, res) => {
  const query = {};
  if (req.query.agentId) query.agentId = req.query.agentId;
  const tasks = await Task.find(query).sort({ createdAt: -1 }).limit(120).lean();
  res.json(tasks);
});

app.get("/api/activity", async (_req, res) => {
  const activity = await ActivityEvent.find({}).sort({ timestamp: -1 }).limit(120).lean();
  res.json(activity);
});

app.get("/api/revenue", async (_req, res) => {
  const events = await RevenueEvent.find({}).sort({ createdAt: -1 }).limit(80).lean();
  const metrics = await stripeSvc.getMetrics().catch((err) => ({ configured: false, error: err.message }));
  res.json({ metrics, revenueEvents: events });
});

app.get("/api/approvals", async (req, res) => {
  const status = req.query.status || "AWAITING_APPROVAL";
  const query = status === "all" ? {} : { status };
  const approvals = await Approval.find(query).sort({ createdAt: -1 }).limit(80).lean();
  res.json(approvals);
});

app.post("/api/approvals/:id/approve", async (req, res) => {
  try {
    const approval = await engine.approve(req.params.id, req.user?.sub || "admin");
    res.json(approval);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/approvals/:id/reject", async (req, res) => {
  try {
    const approval = await engine.reject(req.params.id, req.user?.sub || "admin");
    res.json(approval);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/notifications", async (req, res) => {
  const notifications = await Notification.find({}).sort({ createdAt: -1 }).limit(80).lean();
  const unread = notifications.filter((n) => !n.read).length;
  res.json({ unread, notifications });
});

app.post("/api/notifications/read", async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : null;
  if (ids) {
    await Notification.updateMany({ id: { $in: ids } }, { read: true });
  } else {
    await Notification.updateMany({ read: false }, { read: true });
  }
  res.json({ ok: true });
});

app.get("/api/offers", async (_req, res) => {
  const offers = await Offer.find({}).sort({ createdAt: -1 }).limit(80).lean();
  res.json(offers);
});

app.post("/api/offers", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const amountCents = Number(req.body.amountCents || Math.round(Number(req.body.amount || 0) * 100));
  if (!name || !amountCents) {
    return res.status(400).json({ error: "name and amount required" });
  }
  const offer = await Offer.create({
    id: engine.uid(),
    name,
    description: String(req.body.description || ""),
    amountCents,
    currency: "usd",
    interval: req.body.interval === "month" ? "month" : "one_time",
    status: "pending_approval",
    agent: "admin"
  });
  await engine.createApproval({
    type: "stripe.publish_offer",
    title: `Publish offer: ${offer.name}`,
    summary: `Admin drafted "${offer.name}" at $${(amountCents / 100).toFixed(2)}. Approve to create a Stripe Payment Link that deposits into your Stripe account.`,
    payload: { offerId: offer.id }
  });
  res.status(201).json(offer);
});

async function delegateFromCommand(req, res) {
  const objective = String(req.body.task || req.body.objective || req.body.command || "").trim();
  if (!objective) return res.status(400).json({ error: "Provide task or objective" });
  try {
    const mission = await engine.delegateObjective(objective);
    res.json({ agent: "AGENT007", status: "delegated", mission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
app.post("/api/hermes", delegateFromCommand);
app.post("/api/agent007", delegateFromCommand);

app.post("/api/delegate", async (req, res) => {
  const command = String(req.body.command || req.body.task || req.body.objective || "").trim();
  if (!command) return res.status(400).json({ error: "Command required" });
  try {
    const mission = await engine.delegateObjective(command);
    res.json({
      success: true,
      message: `AGENT007 decomposed "${command}" into ${(mission.taskIds || []).length} agent tasks.`,
      mission
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  if (!req.body.task && !req.body.objective) {
    return res.status(400).json({ error: "task required" });
  }
  try {
    const task = await engine.createTask({
      objective: req.body.task || req.body.objective,
      agentId: req.body.agentId,
      department: req.body.department
    });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/leads", async (req, res) => {
  const lead = await Lead.create({
    id: engine.uid(),
    name: req.body.name || "Inbound Prospect",
    email: req.body.email || "",
    company: req.body.company || "",
    source: req.body.source || "website",
    status: "new"
  });
  await engine.emit("LEAD.CREATED", { lead, message: `New lead ${lead.name}` });
  await engine.createTask({
    objective: `Research and qualify new lead ${lead.name} ${lead.email}`.trim(),
    department: "Acquisition"
  });
  res.status(201).json(lead);
});

app.get("/api/leads", async (_req, res) => {
  res.json(await Lead.find({}).sort({ createdAt: -1 }).limit(80).lean());
});

app.get("/api/sites", async (_req, res) => {
  const sites = await Site.find({ status: "live" }).sort({ createdAt: -1 }).limit(40).lean();
  res.json(sites.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    summary: s.summary,
    url: s.url || `/w/${s.slug}`,
    kind: s.kind || "html",
    download: s.kind === "react-vite" ? `/api/sites/${s.slug}/project.zip` : null,
    agent: s.agent,
    createdAt: s.createdAt
  })));
});

app.get("/api/store", async (_req, res) => {
  const [offers, sites] = await Promise.all([
    Offer.find({ status: "live", paymentUrl: { $ne: null } }).sort({ createdAt: -1 }).lean(),
    Site.find({ status: "live" }).sort({ createdAt: -1 }).limit(24).lean()
  ]);
  res.json({
    company: "AGENT007",
    tagline: "We build and sell live websites, landing pages, and digital products.",
    offers: offers.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      amountCents: o.amountCents,
      interval: o.interval,
      paymentUrl: o.paymentUrl
    })),
    sites: sites.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      summary: s.summary,
      url: s.url || `/w/${s.slug}`,
      kind: s.kind || "html",
      download: s.kind === "react-vite" ? `/api/sites/${s.slug}/project.zip` : null,
      agent: s.agent
    }))
  });
});

app.get("/api/sites/:slug/project.zip", async (req, res) => {
  const site = await Site.findOne({ slug: req.params.slug, status: "live" }).lean();
  if (!site?.files?.length) return res.status(404).json({ error: "No Vite project for this site" });
  const buf = appBuilder.zipProject(site.files);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${site.slug}-vite.zip"`);
  res.send(buf);
});

app.get("/api/apps/:slug/records", async (req, res) => {
  const collection = String(req.query.collection || "items");
  const records = await AppRecord.find({ slug: req.params.slug, collection })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  res.json({ records });
});

app.post("/api/apps/:slug/records", async (req, res) => {
  const site = await Site.findOne({ slug: req.params.slug, status: "live" }).lean();
  if (!site) return res.status(404).json({ error: "App not found" });
  const collection = String(req.body.collection || "items").slice(0, 40);
  const record = await AppRecord.create({
    id: engine.uid(),
    slug: req.params.slug,
    collection,
    data: req.body.data && typeof req.body.data === "object" ? req.body.data : { value: req.body.data }
  });
  res.status(201).json({ record });
});

app.delete("/api/apps/:slug/records/:id", async (req, res) => {
  await AppRecord.deleteOne({ slug: req.params.slug, id: req.params.id });
  res.json({ ok: true });
});

app.get("/w/:slug/app.js", async (req, res) => {
  const site = await Site.findOne({ slug: req.params.slug, status: "live" }).lean();
  if (!site?.bundleJs) return res.status(404).type("js").send("/* missing bundle */");
  res.type("js").send(site.bundleJs);
});

app.get("/w/:slug", async (req, res) => {
  const site = await Site.findOne({ slug: req.params.slug, status: "live" }).lean();
  if (!site) {
    return res
      .status(404)
      .type("html")
      .send("<!doctype html><title>Not found</title><p>This AGENT007 site is not live.</p>");
  }
  res.type("html").send(site.html);
});

app.get("/api/events", (req, res) => {
  const payload = auth.verifyToken(auth.readToken(req));
  if (!payload) {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const unsub = engine.addSubscriber(res);
  res.write(
    `data: ${JSON.stringify({
      type: "SYSTEM.CONNECTED",
      timestamp: new Date().toISOString()
    })}\n\n`
  );
  req.on("close", unsub);
});

app.use(express.static(path.join(__dirname, "../dist")));
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "../dist", "index.html"));
});

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/hermes";
  try {
    await mongoose.connect(uri);
    console.log("MongoDB connected");
    await engine.seed();
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
  }

  engine.start();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`AGENT007 AI Company OS API: http://localhost:${PORT}`);
    console.log(`Stripe mode: ${stripeSvc.stripeMode()} configured=${stripeSvc.isConfigured()}`);
    console.log(`LLM: ${JSON.stringify(ai.providerStatus())}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is in use. Set PORT in .env to a free port.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

main();
