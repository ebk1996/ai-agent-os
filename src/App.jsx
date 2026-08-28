import { useEffect, useMemo, useRef, useState } from "react";
import "./style.css";

const TOKEN_KEY = "agent007_token";
const departments = [
  ["ALL", "∞"],
  ["Acquisition", "◉"],
  ["Marketing", "✦"],
  ["Sales", "↗"],
  ["Clients", "◎"],
  ["Finance", "$"],
  ["Growth", "⌁"],
  ["Technology", "⌘"],
  ["Strategy", "◇"]
];

const money = (n) =>
  "$" +
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: token ? authHeaders(token) : { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function timeAgo(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 10) return "NOW";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const path = window.location.pathname;

  if (path.startsWith("/store")) {
    return <Storefront />;
  }

  if (!token) {
    return (
      <Login
        onLogin={(t) => {
          localStorage.setItem(TOKEN_KEY, t);
          setToken(t);
        }}
      />
    );
  }

  return (
    <OS
      token={token}
      onLogout={() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
      }}
    />
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/admin/login", {
        method: "POST",
        body: { username, password }
      });
      onLogin(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="loginShell">
      <form className="loginCard" onSubmit={submit}>
        <div className="logo loginLogo">
          <strong>007</strong>
          <div>
            AGENT007
            <small>ADMIN PORTAL</small>
          </div>
        </div>
        <h1>Sign in to the company OS.</h1>
        <p>Live Stripe, agent workspaces, and human-approval controls are behind this gate.</p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <div className="formError">{error}</div>}
        <button className="primary" disabled={busy}>
          {busy ? "AUTHENTICATING…" : "ENTER AGENT007 →"}
        </button>
        <small className="hint">Default local account: admin / hermes2026 — change it in .env</small>
      </form>
    </div>
  );
}

function Storefront() {
  const [offers, setOffers] = useState([]);
  const [sites, setSites] = useState([]);
  const [error, setError] = useState("");
  const paid = new URLSearchParams(window.location.search).get("paid");

  useEffect(() => {
    api("/api/store")
      .then((d) => {
        setOffers(d.offers || []);
        setSites(d.sites || []);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="storeShell companySite">
      <header className="storeHead">
        <div className="logo">
          <strong>007</strong>
          <div>
            AGENT007
            <small>LIVE PRODUCTS</small>
          </div>
        </div>
      </header>
      <main className="storeMain">
        <small className="eyebrow">AI COMPANY</small>
        <h1>
          We ship real websites <i>and</i> apps.
        </h1>
        <p className="lead">
          AGENT007 is not a checkout gimmick. Specialist agents design, write, and publish live pages you can open,
          share, and sell. Stripe only runs when you approve a product.
        </p>
        {paid && <div className="banner ok">Payment received. Stripe is settling funds into the company account.</div>}
        {error && <div className="banner bad">{error}</div>}

        <h2 className="storeSection">Live websites</h2>
        <div className="offerGrid">
          {sites.length === 0 && (
            <p className="lead">No sites shipped yet. In the OS, delegate: “Build a landing page for X and publish it.”</p>
          )}
          {sites.map((s) => (
            <article key={s.id} className="offerCard">
              <small>{s.kind === "react-vite" ? "REACT + VITE" : "WEBSITE"}</small>
              <h2>{s.title}</h2>
              <p>{s.summary}</p>
              <a className="primary" href={s.url}>
                OPEN {s.kind === "react-vite" ? "APP" : "SITE"} →
              </a>
              {s.download && (
                <a href={s.download}>
                  Download Vite project
                </a>
              )}
            </article>
          ))}
        </div>

        <h2 className="storeSection">Buy</h2>
        <div className="offerGrid">
          {offers.length === 0 && <p className="lead">No paid products live yet. Approve a Stripe offer in the OS.</p>}
          {offers.map((o) => (
            <article key={o.id} className="offerCard">
              <small>STRIPE</small>
              <h2>{o.name}</h2>
              <p>{o.description}</p>
              <b>
                {money(o.amountCents / 100)}
                {o.interval === "month" ? "/mo" : ""}
              </b>
              <a className="primary" href={o.paymentUrl}>
                PAY WITH STRIPE →
              </a>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function OS({ token, onLogout }) {
  const [view, setView] = useState("COMMAND");
  const [dept, setDept] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [company, setCompany] = useState(null);
  const [agents, setAgents] = useState([]);
  const [missions, setMissions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [offers, setOffers] = useState([]);
  const [sites, setSites] = useState([]);
  const [charges, setCharges] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [command, setCommand] = useState("");
  const [toast, setToast] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const esRef = useRef(null);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function refresh() {
    try {
      const [co, ag, mi, ac, ap, no, of, ch, tk, mx, st] = await Promise.all([
        api("/api/company", { token }),
        api("/api/agents", { token }),
        api("/api/missions", { token }),
        api("/api/activity", { token }),
        api("/api/approvals?status=all", { token }),
        api("/api/notifications", { token }),
        api("/api/offers", { token }),
        api("/api/stripe/charges", { token }).catch(() => []),
        api("/api/tasks", { token }),
        api("/api/metrics", { token }).catch((e) => ({ configured: false, error: e.message })),
        api("/api/sites").catch(() => [])
      ]);
      setCompany(co);
      setAgents(ag);
      setMissions(mi);
      setActivity(ac);
      setApprovals(ap);
      setNotifications(no.notifications || []);
      setUnread(no.unread || 0);
      setOffers(of);
      setSites(st);
      setCharges(ch);
      setTasks(tk);
      setMetrics(mx);
    } catch (err) {
      if (String(err.message).toLowerCase().includes("auth")) onLogout();
      else flash(err.message);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const item = JSON.parse(ev.data);
        if (item.type === "SYSTEM.CONNECTED") return;
        setActivity((a) => [item, ...a].slice(0, 120));
        if (item.type === "APPROVAL.REQUIRED" || item.type === "NOTIFICATION" || item.type === "REVENUE.CREATED") {
          refresh();
        }
      } catch {
        /* ignore malformed sse */
      }
    };
    return () => {
      clearInterval(t);
      es.close();
    };
  }, [token]);

  const visible = useMemo(
    () => (dept === "ALL" ? agents : agents.filter((a) => a.department === dept)),
    [agents, dept]
  );

  const pending = approvals.filter((a) => a.status === "AWAITING_APPROVAL");
  const working = agents.filter((a) => a.status === "WORKING" || a.status === "QUEUED").length;

  async function delegate() {
    if (!command.trim() || busy) return;
    const current = command.trim();
    setCommand("");
    setBusy(true);
    flash("AGENT007 is dispatching real agent work…");
    try {
      const data = await api("/api/delegate", { token, method: "POST", body: { command: current } });
      flash(data.message || "Delegated.");
      refresh();
    } catch (err) {
      flash(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openWorkspace(agent) {
    setSelected(null);
    const full = await api(`/api/agents/${agent.id}`, { token });
    setWorkspace(full);
    setView("AGENTS");
  }

  async function decide(id, action) {
    try {
      await api(`/api/approvals/${id}/${action}`, { token, method: "POST" });
      flash(action === "approve" ? "Approved. Stripe action will execute if required." : "Rejected.");
      refresh();
    } catch (err) {
      flash(err.message);
    }
  }

  const m = metrics || {};
  const revenue = m.dailyRevenue || 0;
  const mrr = m.mrr || 0;
  const customers = m.customers || 0;
  const leads = m.leads || company?.leads || 0;

  return (
    <div className="os">
      <aside>
        <div className="logo">
          <strong>007</strong>
          <div>
            AGENT007
            <small>AI COMPANY OS</small>
          </div>
        </div>
        {[
          ["COMMAND", "⌘"],
          ["REVENUE", "$"],
          ["SITES", "▣"],
          ["AGENTS", "◉"],
          ["MISSIONS", "◆"],
          ["APPROVALS", "!"],
          ["ACTIVITY", "≋"]
        ].map(([x, i]) => (
          <button className={view === x ? "nav on" : "nav"} onClick={() => setView(x)} key={x}>
            <b>{i}</b>
            {x}
            {x === "APPROVALS" && pending.length > 0 && <em className="badge">{pending.length}</em>}
          </button>
        ))}
        <div className="sideStatus">
          <span /> {m.configured ? "STRIPE CONNECTED" : "STRIPE NOT CONFIGURED"}
          <br />
          <small>{agents.length} AGENTS</small>
          <br />
          <small>
            {working} WORKING · {m.mode || "live"} MODE
          </small>
          <br />
          <small>
            LLM {company?.llm?.active ? company.llm.active.toUpperCase() : "NONE"} · CLOUD
          </small>
        </div>
      </aside>

      <main>
        <header>
          <span>
            AGENT007 / <b>{view}</b>
          </span>
          <span className="headRight">
            <i /> {m.configured ? "LIVE" : "OFFLINE"}
            <em>●</em> {working} WORKING
            <button className="bell" onClick={() => setBellOpen((v) => !v)} title="Notifications">
              ⌂{unread > 0 && <em>{unread}</em>}
            </button>
            <button onClick={onLogout} title="Log out">
              BK
            </button>
          </span>
        </header>

        {bellOpen && (
          <div className="bellDrop">
            <div className="panelHead">
              NOTIFICATIONS
              <span
                onClick={async () => {
                  await api("/api/notifications/read", { token, method: "POST", body: {} });
                  refresh();
                }}
              >
                MARK READ
              </span>
            </div>
            {notifications.length === 0 && <p className="empty">No notifications yet.</p>}
            {notifications.slice(0, 12).map((n) => (
              <button
                key={n.id}
                className={n.read ? "note" : "note unread"}
                onClick={() => {
                  if (n.link) setView(n.link);
                  setBellOpen(false);
                }}
              >
                <b>{n.title}</b>
                <span>{n.body}</span>
                <small>{timeAgo(n.createdAt)}</small>
              </button>
            ))}
          </div>
        )}

        {view === "COMMAND" && (
          <Command
            {...{
              revenue,
              mrr,
              leads,
              customers,
              mission: missions[0],
              feed: activity,
              dept,
              setDept,
              visible,
              setSelected,
              command,
              setCommand,
              delegate,
              metrics: m,
              working,
              agents: agents.length,
              pending: pending.length,
              llm: company?.llm
            }}
          />
        )}
        {view === "REVENUE" && (
          <Revenue
            metrics={m}
            charges={charges}
            offers={offers}
            token={token}
            onCreated={() => {
              flash("Offer queued for approval.");
              refresh();
            }}
          />
        )}
        {view === "SITES" && <Sites sites={sites} />}
        {view === "AGENTS" && (
          <Agents {...{ visible, dept, setDept, setSelected, departments, counts: countByDept(agents) }} />
        )}
        {view === "MISSIONS" && <Missions missions={missions} tasks={tasks} />}
        {view === "APPROVALS" && <Approvals pending={pending} all={approvals} decide={decide} />}
        {view === "ACTIVITY" && <Activity feed={activity} />}
      </main>

      {selected && (
        <AgentPreview
          agent={selected}
          close={() => setSelected(null)}
          open={() => openWorkspace(selected)}
        />
      )}

      {workspace && (
        <Workspace
          agent={workspace}
          token={token}
          close={() => setWorkspace(null)}
          onChange={async () => {
            const full = await api(`/api/agents/${workspace.id}`, { token });
            setWorkspace(full);
            refresh();
          }}
        />
      )}

      {toast && <div className="toast">✦ {toast}</div>}
    </div>
  );
}

function countByDept(agents) {
  const map = { ALL: agents.length };
  for (const a of agents) map[a.department] = (map[a.department] || 0) + 1;
  return map;
}

function Command(p) {
  const stripeOk = p.metrics?.configured;
  const llm = p.llm || {};
  const llmOk = Boolean(llm.active);
  return (
    <div className="page">
      <div className="hero">
        <div>
          <small>AUTONOMOUS BUSINESS COMMAND CENTER</small>
          <h1>
            Your company is <i>working.</i>
          </h1>
          <p>
            AGENT007 dispatches real specialist agents who can ship live websites. Money only moves through Stripe after
            you approve it.
          </p>
        </div>
        <div className="agent007">
          <strong>AGENT007</strong>
          <small>{stripeOk ? "STRIPE CONNECTED" : "STRIPE ERROR"}</small>
          <span>{llmOk ? `● LLM ${llm.active.toUpperCase()}` : "● NO LLM KEY"}</span>
        </div>
      </div>

      {!llmOk && (
        <div className="banner bad">
          No cloud LLM key. Ollama is disabled on this 6GB machine so it cannot crash the laptop. Set XAI_API_KEY,
          OPENAI_API_KEY, or GEMINI_API_KEY and restart.
        </div>
      )}

      {llm.paused && (
        <div className="banner bad">
          Cloud LLM quota pause. Jobs will retry. Add a free Groq key (no card) at console.groq.com/keys or OpenRouter
          at openrouter.ai/keys, or a working XAI_API_KEY.
        </div>
      )}

      {(llm.missingFree || []).some((s) => s.id === "groq" || s.id === "openrouter") && (
        <div className="banner ok">
          More free LLM power: paste GROQ_API_KEY from console.groq.com/keys (no credit card, thousands of requests/day)
          and/or OPENROUTER_API_KEY from openrouter.ai/keys. Mistral (France) and DeepSeek (China) work the same way.
          Then restart the API.
        </div>
      )}

      {!stripeOk && (
        <div className="banner bad">
          Stripe: {p.metrics?.error || "not configured"}. Set STRIPE_SECRET_KEY in .env and restart.
        </div>
      )}

      {p.pending > 0 && (
        <div className="banner ok">
          {p.pending} item{p.pending === 1 ? "" : "s"} waiting in Approvals. Agents can draft offers; publishing a Stripe Payment Link still needs you.
        </div>
      )}

      <div className="command">
        <b>⌘</b>
        <input
          value={p.command}
          onChange={(e) => p.setCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && p.delegate()}
          placeholder="Give AGENT007 a real objective — e.g. build a fullstack React Vite app for a $49 client tracker"
        />
        <button onClick={p.delegate}>DELEGATE →</button>
      </div>

      <div className="stats">
        <Stat title="TODAY'S STRIPE CASH" value={money(p.revenue)} delta={stripeOk ? "from live charges" : "unlinked"} />
        <Stat title="MRR" value={money(p.mrr)} delta={`${p.metrics?.activeSubscriptions || 0} subs`} />
        <Stat title="AVAILABLE" value={money(p.metrics?.balance?.available)} delta={`pending ${money(p.metrics?.balance?.pending)}`} />
        <Stat title="LEADS" value={p.leads} delta="captured by agents" />
        <Stat title="WORKFORCE" value={`${p.working} / ${p.agents || 300}`} delta={`${p.pending} awaiting you`} />
      </div>

      <div className="sectionHead">
        <div>
          <small>LIVE WORLD</small>
          <h2>AI Agent Headquarters</h2>
        </div>
        <span>● WORKING &nbsp; ● REVIEW &nbsp; ● IDLE</span>
      </div>

      <World visible={p.visible} setSelected={p.setSelected} />

      <div className="departments">
        {departments.map(([name, icon]) => (
          <button className={p.dept === name ? "selected" : ""} onClick={() => p.setDept(name)} key={name}>
            <b>{icon}</b>
            <strong>{name}</strong>
            <small>{name === "ALL" ? p.visible.length : p.visible.filter((a) => a.department === name).length} shown</small>
          </button>
        ))}
      </div>

      <div className="three">
        <Panel title="LIVE ACTIVITY">
          {p.feed.slice(0, 5).map((x) => (
            <div className="activity" key={x.id || x.timestamp}>
              <i />
              {x.message || x.type}
              <small>{timeAgo(x.timestamp || x.createdAt)}</small>
            </div>
          ))}
          {p.feed.length === 0 && <p className="empty">Waiting for real agent events.</p>}
        </Panel>
        <Panel title="STRIPE FUNNEL">
          <Bar text="Customers" value={p.customers} width="80%" />
          <Bar text="Today" value={money(p.revenue)} width="55%" />
          <Bar text="MRR" value={money(p.mrr)} width="40%" />
          <Bar text="Failed today" value={p.metrics?.failedToday || 0} width="20%" />
        </Panel>
        <Panel title="ACTIVE MISSION">
          <div className="missionTitle">
            ⚡ <b>{p.mission?.name || "No mission yet"}</b>
            <strong>{p.mission?.progress || 0}%</strong>
          </div>
          <div className="progress">
            <i style={{ width: (p.mission?.progress || 0) + "%" }} />
          </div>
          <small>{p.mission?.objective || "Delegate an objective to start real work."}</small>
        </Panel>
      </div>
    </div>
  );
}

function World({ visible, setSelected }) {
  const nodes = visible.slice(0, 32);
  return (
    <div className="world">
      <div className="worldGrid" />
      <div className="inbound">
        INBOUND
        <br />
        {[1, 2, 3, 4, 5, 6].map((x) => (
          <i key={x}>●</i>
        ))}
      </div>
      <div className="core">
        <div>007</div>
        <b>AGENT007</b>
        <small>ORCHESTRATOR</small>
        <span>DELEGATING •••</span>
      </div>
      {nodes.map((a, i) => {
        const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
        const r = i % 2 ? 205 : 285;
        return (
          <button
            key={a.id}
            className={`node ${a.status?.toLowerCase() || "idle"}`}
            style={{
              left: `${50 + (Math.cos(angle) * r) / 7.7}%`,
              top: `${50 + (Math.sin(angle) * r) / 6.1}%`,
              "--d": `${(i % 8) * 0.18}s`
            }}
            onClick={() => setSelected(a)}
          >
            <b>{a.department?.[0]}</b>
            <strong>{a.name}</strong>
            <small>{a.currentTask || a.status}</small>
          </button>
        );
      })}
      <div className="revenueFlow">
        REVENUE
        <br />
        <strong>OFFER → STRIPE → BANK</strong>
        <b>$$$$$$$$</b>
      </div>
    </div>
  );
}

function Stat({ title, value, delta }) {
  return (
    <div className="stat">
      <small>{title}</small>
      <b>{value}</b>
      <span>↗ {delta}</span>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <div className="panelHead">{title}</div>
      {children}
    </section>
  );
}

function Bar({ text, value, width }) {
  return (
    <div className="bar">
      <div>
        <span>{text}</span>
        <b>{value}</b>
      </div>
      <i>
        <em style={{ width }} />
      </i>
    </div>
  );
}

function Sites({ sites }) {
  return (
    <div className="page">
      <small className="eyebrow">SHIPPED PRODUCT</small>
      <h1>
        Live websites, <i>not links.</i>
      </h1>
      <p className="lead">
        Agents ship static pages or full React + Vite apps. Open the live URL, or download the Vite project and run npm install && npm run dev. Data in React apps is saved on the AGENT007 API.
      </p>
      <div className="offerGrid">
        {(sites || []).length === 0 && (
          <p className="lead">No sites yet. From Command: “Build a fullstack React Vite app for a client CRM.”</p>
        )}
        {(sites || []).map((s) => (
          <article key={s.id} className="offerCard">
            <small>
              {s.agent} · {s.kind === "react-vite" ? "REACT/VITE" : "HTML"}
            </small>
            <h2>{s.title}</h2>
            <p>{s.summary}</p>
            <a className="primary" href={s.url} target="_blank" rel="noreferrer">
              OPEN {s.url} →
            </a>
            {s.download && (
              <a href={s.download}>
                Download Vite zip
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function Revenue({ metrics, charges, offers, token, onCreated }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("49");
  const [description, setDescription] = useState("");
  const [interval, setInterval] = useState("one_time");
  const [busy, setBusy] = useState(false);

  async function createOffer(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/offers", {
        token,
        method: "POST",
        body: { name, amount: Number(amount), description, interval }
      });
      setName("");
      setDescription("");
      onCreated();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <small className="eyebrow">REVENUE WAR ROOM</small>
      <h1>
        Real Stripe, <i>not theater.</i>
      </h1>
      <p className="lead">
        {metrics?.account?.email
          ? `Connected to ${metrics.account.email} (${metrics.account.id}). Charges enabled: ${metrics.account.chargesEnabled ? "yes" : "no"}.`
          : metrics?.error || "Stripe is not connected."}
      </p>
      {!metrics?.configured && <div className="banner bad">{metrics?.error}</div>}

      <div className="bigStats">
        <Stat title="AVAILABLE" value={money(metrics?.balance?.available)} delta={`mode ${metrics?.mode || "?"}`} />
        <Stat title="PENDING" value={money(metrics?.balance?.pending)} delta="settling" />
        <Stat title="MRR" value={money(metrics?.mrr)} delta={`${metrics?.activeSubscriptions || 0} active subs`} />
      </div>

      <form className="offerForm" onSubmit={createOffer}>
        <h3>Create an offer</h3>
        <p>Publishing to Stripe requires human approval. After you approve it, a live Payment Link is created.</p>
        <div className="offerRow">
          <input placeholder="Offer name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Price USD" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select value={interval} onChange={(e) => setInterval(e.target.value)}>
            <option value="one_time">One-time</option>
            <option value="month">Monthly</option>
          </select>
          <button className="primary" disabled={busy}>
            QUEUE FOR APPROVAL
          </button>
        </div>
        <input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </form>

      <div className="three">
        <Panel title="OFFERS">
          {offers.length === 0 && <p className="empty">No offers yet.</p>}
          {offers.slice(0, 8).map((o) => (
            <div className="activity" key={o.id}>
              <i />
              <span>
                {o.name} · {money(o.amountCents / 100)} {o.status}
              </span>
              {o.paymentUrl && (
                <a href={o.paymentUrl} target="_blank" rel="noreferrer">
                  LINK
                </a>
              )}
            </div>
          ))}
        </Panel>
        <Panel title="RECENT CHARGES">
          {charges.length === 0 && <p className="empty">No charges returned from Stripe.</p>}
          {charges.slice(0, 8).map((c) => (
            <div className="activity" key={c.id}>
              <i />
              <span>
                {money(c.amount)} · {c.status}
                {c.failureMessage ? ` · ${c.failureMessage}` : ""}
              </span>
              <small>{timeAgo(c.created)}</small>
            </div>
          ))}
        </Panel>
        <Panel title="PAYOUTS">
          {(metrics?.payouts || []).length === 0 && <p className="empty">No payouts yet. Stripe pays out after charges succeed and settle.</p>}
          {(metrics?.payouts || []).map((p) => (
            <div className="activity" key={p.id}>
              <i />
              {money(p.amount)} · {p.status}
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Agents({ visible, dept, setDept, setSelected, counts }) {
  return (
    <div className="page">
      <small className="eyebrow">AGENT UNIVERSE</small>
      <h1>
        Digital <i>workers.</i>
      </h1>
      <p className="lead">Open any agent to enter a real workspace — chat, assign work, and read their output.</p>
      <div className="departments">
        {departments.map(([name, icon]) => (
          <button className={dept === name ? "selected" : ""} onClick={() => setDept(name)} key={name}>
            <b>{icon}</b>
            <strong>{name}</strong>
            <small>{counts[name] || 0}</small>
          </button>
        ))}
      </div>
      <div className="agentList">
        {visible.map((a) => (
          <button onClick={() => setSelected(a)} className="agentRow" key={a.id}>
            <i />
            <b>{a.name}</b>
            <span>{a.department}</span>
            <span>{a.currentTask || a.lastOutput?.slice(0, 60) || "Idle"}</span>
            <span>{a.tasksCompleted || 0} done</span>
            <strong>{a.status}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function Missions({ missions, tasks }) {
  return (
    <div className="page">
      <small className="eyebrow">AUTONOMOUS MISSIONS</small>
      <h1>
        Company <i>objectives.</i>
      </h1>
      <div className="missionGrid">
        {missions.length === 0 && <p className="lead">Delegate an objective from Command to create a mission.</p>}
        {missions.map((m) => (
          <div className="missionCard" key={m.id}>
            <header>
              <span>◆</span>
              <b>{m.progress || 0}%</b>
            </header>
            <h2>{m.name}</h2>
            <p>{m.objective}</p>
            <div className="progress">
              <i style={{ width: (m.progress || 0) + "%" }} />
            </div>
            <small>{(m.taskIds || []).length} tasks · {m.status}</small>
            <ul className="planList">
              {(m.plan || []).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h3 className="subhead">Recent tasks</h3>
      <div className="agentList">
        {tasks.slice(0, 20).map((t) => (
          <div className="agentRow static" key={t.id}>
            <i />
            <b>{t.agent}</b>
            <span>{t.department}</span>
            <span>{t.objective}</span>
            <span>{t.mode}</span>
            <strong>{t.status}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function Approvals({ pending, all, decide }) {
  return (
    <div className="page">
      <small className="eyebrow">HUMAN APPROVAL</small>
      <h1>
        Nothing money-related <i>moves</i> without you.
      </h1>
      <p className="lead">
        Stripe Payment Links, publishing, and risky tasks sit here. Approve to execute. Reject to stop.
      </p>
      <div className="approvalGrid">
        {pending.length === 0 && <div className="banner ok">No items waiting. You will get a notification when an agent needs you.</div>}
        {pending.map((a) => (
          <article className="approvalCard" key={a.id}>
            <small>{a.type}</small>
            <h2>{a.title}</h2>
            <p>{a.summary}</p>
            <div className="approvalMeta">
              {a.agent || "AGENT007"} · {timeAgo(a.createdAt)}
            </div>
            <div className="approvalActions">
              <button className="primary" onClick={() => decide(a.id, "approve")}>
                APPROVE →
              </button>
              <button className="ghost" onClick={() => decide(a.id, "reject")}>
                REJECT
              </button>
            </div>
          </article>
        ))}
      </div>
      {all.filter((x) => x.status !== "AWAITING_APPROVAL").length > 0 && (
        <>
          <h3 className="subhead">History</h3>
          <div className="agentList">
            {all
              .filter((x) => x.status !== "AWAITING_APPROVAL")
              .slice(0, 20)
              .map((a) => (
                <div className="agentRow static" key={a.id}>
                  <i />
                  <b>{a.title}</b>
                  <span>{a.type}</span>
                  <span>{a.agent}</span>
                  <span>{a.decidedBy}</span>
                  <strong>{a.status}</strong>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function Activity({ feed }) {
  return (
    <div className="page">
      <small className="eyebrow">LIVE ACTIVITY</small>
      <h1>
        Everything the workforce <i>does.</i>
      </h1>
      <div className="activityLarge">
        {feed.length === 0 && <div className="activity">No events yet. Delegate work to generate a real audit trail.</div>}
        {feed.map((x) => (
          <div className="activity" key={x.id}>
            <i />
            <span>
              <b>{x.type}</b> {x.message || x.objective || x.action || ""}
              {x.provider ? ` · ${x.provider}` : ""}
            </span>
            <small>{timeAgo(x.timestamp || x.createdAt)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentPreview({ agent, close, open }) {
  return (
    <div className="modalBack" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={close}>
          ×
        </button>
        <div className="modalIcon">{agent.department?.[0]}</div>
        <small>AGENT {agent.id}</small>
        <h2>{agent.name}</h2>
        <p>
          {agent.role} · {agent.department}
        </p>
        <div className="status">
          ● {agent.status}
          <span>{agent.efficiency}% efficiency</span>
        </div>
        <div className="task">
          <small>CURRENT TASK</small>
          <b>{agent.currentTask || "Idle — assign work in the workspace"}</b>
        </div>
        <div className="modalStats">
          <div>
            <small>COMPLETED</small>
            <b>{agent.tasksCompleted || 0}</b>
          </div>
          <div>
            <small>ATTRIBUTED</small>
            <b>{money(agent.revenueAttributed)}</b>
          </div>
          <div>
            <small>ACCESS</small>
            <b>{agent.permissions?.financial_action ? "FINANCE" : "STANDARD"}</b>
          </div>
        </div>
        <button className="primary" onClick={open}>
          OPEN AGENT WORKSPACE →
        </button>
      </div>
    </div>
  );
}

function Workspace({ agent, token, close, onChange }) {
  const [message, setMessage] = useState("");
  const [assign, setAssign] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [agent.messages]);

  async function send(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    try {
      await api(`/api/agents/${agent.id}/chat`, { token, method: "POST", body: { message } });
      setMessage("");
      await onChange();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function assignWork(e) {
    e.preventDefault();
    if (!assign.trim()) return;
    setBusy(true);
    try {
      await api(`/api/agents/${agent.id}/assign`, { token, method: "POST", body: { objective: assign } });
      setAssign("");
      await onChange();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspaceBack">
      <div className="workspacePanel">
        <header>
          <div>
            <small>
              WORKSPACE · {agent.id} · {agent.department}
            </small>
            <h2>{agent.name}</h2>
            <p>
              {agent.role} · {(agent.skills || []).join(" · ")} · {agent.status}
            </p>
          </div>
          <button className="close" onClick={close}>
            ×
          </button>
        </header>
        <div className="workspaceBody">
          <div className="thread" ref={scroller}>
            {(agent.messages || []).length === 0 && (
              <div className="empty">No workspace history yet. Chat or assign a task.</div>
            )}
            {(agent.messages || []).map((m) => (
              <div key={m.id} className={`bubble ${m.role}`}>
                <small>{m.role}</small>
                <pre>{m.content}</pre>
              </div>
            ))}
          </div>
          <aside className="workspaceSide">
            <h3>Assign work</h3>
            <form onSubmit={assignWork}>
              <textarea value={assign} onChange={(e) => setAssign(e.target.value)} placeholder="Concrete task for this agent" />
              <button className="primary" disabled={busy}>
                QUEUE TASK
              </button>
            </form>
            <h3>Recent tasks</h3>
            {(agent.tasks || []).slice(0, 8).map((t) => (
              <div className="miniTask" key={t.id}>
                <b>{t.status}</b>
                <span>{t.objective}</span>
              </div>
            ))}
          </aside>
        </div>
        <form className="composer" onSubmit={send}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Talk to ${agent.name}…`}
          />
          <button className="primary" disabled={busy}>
            SEND
          </button>
        </form>
      </div>
    </div>
  );
}
