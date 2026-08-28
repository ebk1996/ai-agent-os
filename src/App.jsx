import { useEffect, useMemo, useState } from "react";
import "./style.css";

const departments = [
  ["ALL","∞",300],["ACQUISITION","◉",48],["MARKETING","✦",42],
  ["SALES","↗",46],["CLIENTS","◎",38],["FINANCE","$",30],
  ["GROWTH","⌁",34],["TECHNOLOGY","⌘",32],["STRATEGY","◇",30]
];

const roles = [
  ["Lead Hunter","ACQUISITION"],["Market Researcher","ACQUISITION"],
  ["SEO Strategist","MARKETING"],["Content Architect","MARKETING"],
  ["Campaign Analyst","MARKETING"],["Sales Qualifier","SALES"],
  ["Offer Architect","SALES"],["Closer","SALES"],
  ["Customer Success","CLIENTS"],["Support Specialist","CLIENTS"],
  ["Revenue Analyst","FINANCE"],["Forecast Agent","FINANCE"],
  ["CRO Scientist","GROWTH"],["Retention Scientist","GROWTH"],
  ["Developer","TECHNOLOGY"],["QA Engineer","TECHNOLOGY"],
  ["DevOps Agent","TECHNOLOGY"],["Strategy Analyst","STRATEGY"]
];

const actions = [
  "Scanning qualified prospects","Analyzing market signals",
  "Scoring inbound lead","Building campaign brief",
  "Optimizing conversion funnel","Preparing customer follow-up",
  "Running revenue forecast","Detecting churn risk",
  "Updating company knowledge","Testing workflow",
  "Finding expansion opportunity","Analyzing competitor signal"
];

const agents = Array.from({length:300},(_,i)=>{
  const [role,department] = roles[i % roles.length];
  return {
    id:i+1,
    name:`${role} #${String(i+1).padStart(3,"0")}`,
    role,department,
    status:i%19===0?"REVIEW":i%23===0?"WAITING":"WORKING",
    efficiency:78+(i*13)%23,
    progress:30+(i*17)%69,
    action:actions[i%actions.length],
    leads:(i*7)%91,
    revenue:(i*137)%4300
  };
});

const money=n=>"$"+Math.round(n).toLocaleString();

export default function App(){
  const [view,setView]=useState("COMMAND");
  const [dept,setDept]=useState("ALL");
  const [selected,setSelected]=useState(null);
  const [leads,setLeads]=useState(384);
  const [revenue,setRevenue]=useState(4826);
  const [mrr,setMrr]=useState(18740);
  const [customers,setCustomers]=useState(341);
  const [mission,setMission]=useState(64);
  const [feed,setFeed]=useState([
    "Hermes deployed 18 agents to the acquisition mission",
    "Lead Hunter #017 qualified a high-intent prospect",
    "CRO Scientist #142 identified a checkout bottleneck",
    "Revenue Analyst #211 updated today's forecast",
    "Customer Success #088 detected a retention opportunity"
  ]);
  const [command,setCommand]=useState("");
  const [toast,setToast]=useState("");

  useEffect(()=>{
    const t=setInterval(()=>{
      setLeads(x=>x+1+Math.floor(Math.random()*3));
      setRevenue(x=>x+8+Math.floor(Math.random()*35));
      if(Math.random()>.86){
        setCustomers(x=>x+1);
        setMrr(x=>x+49);
      }
      setMission(x=>Math.min(99,x+(Math.random()>.7?1:0)));
      if(Math.random()>.48){
        const a=agents[Math.floor(Math.random()*agents.length)];
        const action=actions[Math.floor(Math.random()*actions.length)];
        setFeed(f=>[`Agent ${a.id}: ${action}`,...f].slice(0,8));
      }
    },1800);
    return()=>clearInterval(t);
  },[]);

  const visible=useMemo(
    ()=>dept==="ALL"?agents:agents.filter(a=>a.department===dept),
    [dept]
  );

  function delegate(){
    if(!command.trim())return;
    setFeed(f=>[`Hermes accepted objective: "${command.trim()}"`,...f].slice(0,8));
    setToast("Hermes decomposed the objective and dispatched agents.");
    setCommand("");
    setTimeout(()=>setToast(""),3000);
  }

  return <div className="os">
    <aside>
      <div className="logo"><strong>H</strong><div>HERMES<small>AI COMPANY OS</small></div></div>
      {[
        ["COMMAND","⌘"],["REVENUE","$"],["AGENTS","◉"],
        ["MISSIONS","◆"],["ACTIVITY","≋"]
      ].map(([x,i])=>
        <button className={view===x?"nav on":"nav"} onClick={()=>setView(x)} key={x}>
          <b>{i}</b>{x}
        </button>
      )}
      <div className="sideStatus"><span/> SYSTEMS NOMINAL<br/><small>300 AGENTS</small><br/><small>HERMES ONLINE</small></div>
    </aside>

    <main>
      <header>
        <span>HERMES / <b>{view}</b></span>
        <span><i/> LIVE <em>●</em> 300 WORKERS <button>BK</button></span>
      </header>

      {view==="COMMAND" &&
      <Command
        {...{leads,revenue,mrr,customers,mission,feed,dept,setDept,
        visible,setSelected,command,setCommand,delegate}}
      />}

      {view==="REVENUE" &&
      <Revenue {...{revenue,mrr,leads,customers,mission}}/>}

      {view==="AGENTS" &&
      <Agents {...{visible,dept,setDept,setSelected}}/>}

      {view==="MISSIONS" && <Missions mission={mission}/>}
      {view==="ACTIVITY" && <Activity feed={feed}/>}
    </main>

    {selected &&
      <Agent agent={selected} close={()=>setSelected(null)}/>}

    {toast && <div className="toast">✦ {toast}</div>}
  </div>
}

function Command(p){
  return <div className="page">
    <div className="hero">
      <div>
        <small>AUTONOMOUS BUSINESS COMMAND CENTER</small>
        <h1>Your company is <i>alive.</i></h1>
        <p>300 AI workers continuously discover opportunities, execute workflows,
        optimize funnels and protect recurring revenue.</p>
      </div>
      <div className="hermes">
        <strong>HERMES</strong>
        <small>CONDUCTOR ONLINE</small>
        <span>●</span>
      </div>
    </div>

    <div className="command">
      <b>⌘</b>
      <input value={p.command}
        onChange={e=>p.setCommand(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&p.delegate()}
        placeholder="Give Hermes a business objective…"/>
      <button onClick={p.delegate}>DELEGATE →</button>
    </div>

    <div className="stats">
      <Stat title="TODAY'S REVENUE" value={money(p.revenue)} delta="+18.4%"/>
      <Stat title="MONTHLY RECURRING" value={money(p.mrr)} delta="+8.7%"/>
      <Stat title="ACTIVE LEADS" value={p.leads.toLocaleString()} delta="+41 today"/>
      <Stat title="CUSTOMERS" value={p.customers} delta="+7 today"/>
      <Stat title="AI WORKFORCE" value="287 / 300" delta="95.7% active"/>
    </div>

    <div className="sectionHead">
      <div><small>LIVE WORLD</small><h2>AI Agent Headquarters</h2></div>
      <span>● WORKING &nbsp; ● REVIEW &nbsp; ● WAITING</span>
    </div>

    <World visible={p.visible} setSelected={p.setSelected}/>

    <div className="departments">
      {departments.map(([name,icon,count])=>
        <button className={p.dept===name?"selected":""}
          onClick={()=>p.setDept(name)} key={name}>
          <b>{icon}</b><strong>{name}</strong><small>{count} agents</small>
        </button>
      )}
    </div>

    <div className="three">
      <Panel title="LIVE ACTIVITY">
        {p.feed.slice(0,5).map((x,i)=>
          <div className="activity" key={i}><i/>{x}<small>{i?"2m":"NOW"}</small></div>
        )}
      </Panel>

      <Panel title="REVENUE FUNNEL">
        <Bar text="Traffic" value="12,481" width="100%"/>
        <Bar text="Leads" value={p.leads} width="72%"/>
        <Bar text="Qualified" value="126" width="49%"/>
        <Bar text="Customers" value={p.customers} width="31%"/>
        <Bar text="Recurring" value={money(p.mrr)} width="25%"/>
      </Panel>

      <Panel title="ACTIVE MISSION">
        <div className="missionTitle">⚡ <b>Grow recurring revenue</b>
          <strong>{p.mission}%</strong></div>
        <div className="progress"><i style={{width:p.mission+"%"}}/></div>
        <small>193 agents deployed · target +$5,000 MRR</small>
      </Panel>
    </div>
  </div>
}

function World({visible,setSelected}){
  return <div className="world">
    <div className="worldGrid"/>
    <div className="inbound">INBOUND<br/>
      {[1,2,3,4,5,6].map(x=><i key={x}>●</i>)}
    </div>

    <div className="core">
      <div>H</div><b>HERMES</b><small>ORCHESTRATOR</small>
      <span>DELEGATING •••</span>
    </div>

    {visible.slice(0,32).map((a,i)=>{
      const angle=i/32*Math.PI*2;
      const r=i%2?205:285;
      return <button key={a.id} className="node"
        style={{left:`${50+Math.cos(angle)*r/7.7}%`,
        top:`${50+Math.sin(angle)*r/6.1}%`,
        "--d":`${i%8*.18}s`}}
        onClick={()=>setSelected(a)}>
        <b>{a.department[0]}</b>
        <strong>{a.name}</strong>
        <small>{a.action}</small>
      </button>
    })}

    <div className="revenueFlow">REVENUE<br/><strong>LEAD → SALE → MRR</strong><b>$$$$$$$$</b></div>
  </div>
}

function Stat({title,value,delta}){
  return <div className="stat"><small>{title}</small><b>{value}</b><span>↗ {delta}</span></div>
}

function Panel({title,children}){
  return <section className="panel"><div className="panelHead">{title}<span>OPEN →</span></div>{children}</section>
}

function Bar({text,value,width}){
  return <div className="bar"><div><span>{text}</span><b>{value}</b></div>
    <i><em style={{width}}/></i></div>
}

function Revenue({revenue,mrr,leads,customers,mission}){
  return <div className="page">
    <small className="eyebrow">REVENUE WAR ROOM</small>
    <h1>Optimize the <i>engine.</i></h1>
    <p className="lead">Hermes allocates agents toward acquisition, conversion,
    retention and expansion based on measurable outcomes.</p>

    <div className="bigStats">
      <Stat title="TODAY" value={money(revenue)} delta="+18.4%"/>
      <Stat title="MRR" value={money(mrr)} delta="+8.7%"/>
      <Stat title="CUSTOMERS" value={customers} delta="96.2% retained"/>
    </div>

    <div className="three">
      <Panel title="ACQUISITION">
        <Bar text="Visitors" value="12,481" width="100%"/>
        <Bar text="Leads" value={leads} width="71%"/>
        <Bar text="Qualified" value="126" width="46%"/>
      </Panel>
      <Panel title="CONVERSION">
        <Bar text="Trials" value="32" width="70%"/>
        <Bar text="Paid" value="19" width="51%"/>
        <Bar text="Conversion" value="59.4%" width="59%"/>
      </Panel>
      <Panel title="RETENTION">
        <Bar text="Active" value={customers} width="94%"/>
        <Bar text="Renewal" value="96.2%" width="96%"/>
        <Bar text="Expansion" value="$1,280" width="64%"/>
      </Panel>
    </div>

    <div className="strategy">
      <div><small>HERMES RECOMMENDATION</small>
        <h2>Shift 12 agents toward retention.</h2>
        <p>Retention is producing higher incremental MRR per agent than acquisition.
        Estimated impact: <b>+$1,940 MRR/month.</b></p>
      </div>
      <button>APPROVE REALLOCATION →</button>
    </div>
  </div>
}

function Agents({visible,dept,setDept,setSelected}){
  return <div className="page">
    <small className="eyebrow">AGENT UNIVERSE</small>
    <h1>300 digital <i>workers.</i></h1>
    <p className="lead">Every agent has a role, task, KPI, efficiency score,
    permissions and audit history.</p>
    <div className="departments">
      {departments.map(([name,icon,count])=>
        <button className={dept===name?"selected":""} onClick={()=>setDept(name)} key={name}>
          <b>{icon}</b><strong>{name}</strong><small>{count}</small>
        </button>
      )}
    </div>
    <div className="agentList">
      {visible.map(a=>
        <button onClick={()=>setSelected(a)} className="agentRow" key={a.id}>
          <i/><b>{a.name}</b><span>{a.department}</span>
          <span>{a.action}</span><span>{a.efficiency}% efficiency</span>
          <strong>{a.status}</strong>
        </button>
      )}
    </div>
  </div>
}

function Missions({mission}){
  const ms=[
    ["⚡","Increase MRR by $5,000",mission,193],
    ["◎","Reduce churn below 3%",78,61],
    ["✦","Launch organic acquisition engine",52,42],
    ["↗","Improve checkout conversion",86,27]
  ];
  return <div className="page"><small className="eyebrow">AUTONOMOUS MISSIONS</small>
    <h1>Company <i>objectives.</i></h1>
    <p className="lead">Hermes converts strategic goals into executable missions.</p>
    <div className="missionGrid">
      {ms.map(m=><div className="missionCard" key={m[1]}>
        <header><span>{m[0]}</span><b>{m[2]}%</b></header>
        <h2>{m[1]}</h2><div className="progress"><i style={{width:m[2]+"%"}}/></div>
        <small>{m[3]} agents deployed</small><button>OPEN MISSION →</button>
      </div>)}
    </div>
  </div>
}

function Activity({feed}){
  return <div className="page"><small className="eyebrow">LIVE ACTIVITY</small>
    <h1>Everything the workforce <i>does.</i></h1>
    <div className="activityLarge">
      {[...feed,...feed,...feed].map((x,i)=>
        <div className="activity" key={i}><i/><span>{x}</span><small>{i<5?"NOW":i+"m ago"}</small></div>
      )}
    </div>
  </div>
}

function Agent({agent,close}){
  return <div className="modalBack" onClick={close}>
    <div className="modal" onClick={e=>e.stopPropagation()}>
      <button className="close" onClick={close}>×</button>
      <div className="modalIcon">{agent.department[0]}</div>
      <small>AGENT #{agent.id}</small>
      <h2>{agent.name}</h2><p>{agent.role} · {agent.department}</p>
      <div className="status">● {agent.status}<span>{agent.efficiency}% efficiency</span></div>
      <div className="task"><small>CURRENT TASK</small><b>{agent.action}</b>
        <div className="progress"><i style={{width:agent.progress+"%"}}/></div>
        <small>{agent.progress}% complete</small>
      </div>
      <div className="modalStats">
        <div><small>LEADS</small><b>{agent.leads}</b></div>
        <div><small>ATTRIBUTED</small><b>{money(agent.revenue)}</b></div>
        <div><small>ACCESS</small><b>STANDARD</b></div>
      </div>
      <button className="primary">OPEN AGENT WORKSPACE →</button>
    </div>
  </div>
}
