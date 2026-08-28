const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

/* =========================================================
   COMPANY CONFIGURATION
========================================================= */

const departments = [
  { name:"Communications", icon:"◌", agents:38 },
  { name:"Sales", icon:"↗", agents:46 },
  { name:"Finance", icon:"$", agents:30 },
  { name:"Clients", icon:"◎", agents:38 },
  { name:"Marketing", icon:"✦", agents:42 },
  { name:"Growth", icon:"⌁", agents:34 },
  { name:"Tech", icon:"⌘", agents:32 },
  { name:"Strategy", icon:"◇", agents:40 }
];

const roles = [
  ["Lead Hunter","Acquisition",["research","lead-generation","qualification"]],
  ["Market Researcher","Acquisition",["research","market-analysis"]],
  ["ICP Analyst","Acquisition",["research","segmentation"]],
  ["SEO Strategist","Marketing",["seo","keyword-research","analytics"]],
  ["Content Architect","Marketing",["content","copywriting","strategy"]],
  ["Social Agent","Marketing",["social","content","analytics"]],
  ["Campaign Agent","Marketing",["campaigns","analytics","optimization"]],
  ["Sales Qualifier","Sales",["qualification","crm","research"]],
  ["Offer Architect","Sales",["offers","copywriting","conversion"]],
  ["Sales Agent","Sales",["sales","crm","follow-up"]],
  ["CRM Agent","Sales",["crm","data-management"]],
  ["Customer Success","Clients",["customer-success","retention"]],
  ["Support Agent","Clients",["support","knowledge-search"]],
  ["Retention Agent","Clients",["retention","customer-health"]],
  ["Bookkeeper","Finance",["accounting","reconciliation"]],
  ["Invoice Agent","Finance",["invoicing","accounts-receivable"]],
  ["Finance Analyst","Finance",["forecasting","analytics"]],
  ["Growth Analyst","Growth",["analytics","experimentation"]],
  ["Funnel Agent","Growth",["conversion","funnels","optimization"]],
  ["CRO Agent","Growth",["cro","experimentation"]],
  ["Developer Agent","Tech",["javascript","backend","frontend"]],
  ["QA Agent","Tech",["testing","quality-assurance"]],
  ["DevOps Agent","Tech",["docker","kubernetes","deployment"]],
  ["Security Agent","Tech",["security","audit"]],
  ["Strategy Agent","Strategy",["strategy","planning","analysis"]]
];

const sops = [
  {
    id:"lead-qualification",
    name:"Qualify New Lead",
    department:"Sales",
    mode:"autonomous",
    skills:["research","qualification","CRM"],
    steps:["research lead","score intent","identify ICP fit","prepare CRM record"]
  },
  {
    id:"campaign",
    name:"Create Marketing Campaign",
    department:"Marketing",
    mode:"human-assisted",
    skills:["copywriting","campaigns","analytics"],
    steps:["research audience","create campaign","prepare assets","measure results"]
  },
  {
    id:"invoice",
    name:"Process Invoice",
    department:"Finance",
    mode:"human-assisted",
    skills:["accounting","invoicing"],
    steps:["extract invoice","validate","categorize","prepare approval"]
  },
  {
    id:"support",
    name:"Resolve Client Request",
    department:"Clients",
    mode:"autonomous",
    skills:["support","knowledge-search"],
    steps:["understand request","search knowledge","draft resolution","verify"]
  },
  {
    id:"deploy",
    name:"Deploy Application",
    department:"Tech",
    mode:"human-assisted",
    skills:["docker","kubernetes","deployment"],
    steps:["validate build","run tests","prepare deployment","request approval"]
  }
];

/* =========================================================
   300 AGENTS
========================================================= */

const agents = Array.from({ length:300 }, (_,i) => {
  const role = roles[i % roles.length];

  return {
    id:`agent-${String(i+1).padStart(3,"0")}`,
    number:i+1,
    name:`${role[0]} #${String(i+1).padStart(3,"0")}`,
    role:role[0],
    department:role[1],
    skills:role[2],
    status:i % 17 === 0 ? "REVIEW" : "WORKING",
    efficiency:78 + ((i * 11) % 22),
    tasksCompleted:(i * 7) % 180,
    revenueAttributed:(i * 137) % 5000,
    permissions:{
      research:true,
      draft:true,
      analyze:true,
      external_write:i % 5 === 0,
      financial_action:false
    }
  };
});

/* =========================================================
   RUNTIME STATE
========================================================= */

const state = {
  leads:384,
  customers:341,
  dailyRevenue:4826,
  mrr:18740,
  missions:[
    {
      id:"mission-001",
      name:"Increase recurring revenue",
      target:"+$5,000 MRR",
      progress:64,
      agents:193,
      status:"ACTIVE"
    },
    {
      id:"mission-002",
      name:"Reduce customer churn",
      target:"< 3%",
      progress:78,
      agents:61,
      status:"ACTIVE"
    },
    {
      id:"mission-003",
      name:"Build organic acquisition engine",
      target:"+100 qualified leads",
      progress:52,
      agents:42,
      status:"ACTIVE"
    }
  ],
  tasks:[],
  activity:[],
  approvals:[],
  clients:[],
  revenueEvents:[]
};

const clients = new Map();
const subscribers = new Set();

/* =========================================================
   EVENT SYSTEM
========================================================= */

function event(type,payload={}) {
  const item = {
    id:crypto.randomUUID(),
    type,
    timestamp:new Date().toISOString(),
    ...payload
  };

  state.activity.unshift(item);
  state.activity = state.activity.slice(0,200);

  const data = `data: ${JSON.stringify(item)}\n\n`;

  for(const res of subscribers){
    try { res.write(data); }
    catch { subscribers.delete(res); }
  }

  return item;
}

/* =========================================================
   AGENT EXECUTION
========================================================= */

function findAgentForTask(task){
  const text = String(task).toLowerCase();

  let best = agents.find(a =>
    a.skills.some(skill => text.includes(skill))
  );

  if(!best){
    best = agents.find(a => a.status === "WORKING") || agents[0];
  }

  return best;
}

function determineMode(task){
  const text = String(task).toLowerCase();

  if(
    text.includes("send money") ||
    text.includes("charge") ||
    text.includes("purchase") ||
    text.includes("delete") ||
    text.includes("publish") ||
    text.includes("send email")
  ){
    return "human-approval";
  }

  return "autonomous";
}

function createTask(task, parentId=null){
  const agent = findAgentForTask(task);
  const mode = determineMode(task);

  const item = {
    id:crypto.randomUUID(),
    objective:task,
    parentId,
    agentId:agent.id,
    agent:agent.name,
    department:agent.department,
    status:mode === "human-approval" ? "AWAITING_APPROVAL" : "QUEUED",
    mode,
    createdAt:new Date().toISOString()
  };

  state.tasks.unshift(item);

  event("TASK.CREATED",{
    taskId:item.id,
    agentId:agent.id,
    agent:agent.name,
    objective:task,
    department:agent.department
  });

  if(mode === "human-approval"){
    state.approvals.push(item);
    event("APPROVAL.REQUIRED",{
      taskId:item.id,
      agent:agent.name,
      objective:task
    });
  } else {
    executeTask(item);
  }

  return item;
}

function executeTask(task){
  task.status="RUNNING";

  event("AGENT.WORKING",{
    taskId:task.id,
    agentId:task.agentId,
    agent:task.agent,
    department:task.department,
    action:task.objective
  });

  const agent = agents.find(a=>a.id===task.agentId);

  setTimeout(()=>{
    task.status="COMPLETED";
    task.completedAt=new Date().toISOString();

    if(agent){
      agent.tasksCompleted++;
      agent.revenueAttributed += Math.floor(Math.random()*150);
    }

    event("TASK.COMPLETED",{
      taskId:task.id,
      agentId:task.agentId,
      agent:task.agent,
      result:"Workflow completed and verified."
    });
  },700 + Math.random()*1600);
}

/* =========================================================
   HERMES ORCHESTRATOR
========================================================= */

function buildPlan(objective){
  const text=objective.toLowerCase();

  if(text.includes("revenue") || text.includes("mrr")){
    return [
      "Analyze current revenue",
      "Identify highest-value acquisition opportunities",
      "Research and qualify prospects",
      "Analyze conversion funnel",
      "Identify retention and expansion opportunities",
      "Measure expected MRR impact",
      "Report results to Hermes"
    ];
  }

  if(text.includes("customer") || text.includes("client")){
    return [
      "Analyze customer context",
      "Identify customer need",
      "Search company knowledge",
      "Assign client specialist",
      "Prepare resolution",
      "Verify outcome"
    ];
  }

  if(text.includes("marketing") || text.includes("campaign")){
    return [
      "Research target audience",
      "Analyze existing campaigns",
      "Create campaign strategy",
      "Generate campaign assets",
      "Prepare measurement plan",
      "Request approval when required"
    ];
  }

  return [
    "Understand objective",
    "Search company knowledge",
    "Select specialist agents",
    "Execute workflow",
    "Verify result",
    "Report outcome"
  ];
}

function delegateObjective(objective){
  const plan=buildPlan(objective);

  const mission={
    id:crypto.randomUUID(),
    objective,
    status:"ACTIVE",
    createdAt:new Date().toISOString(),
    plan,
    tasks:[]
  };

  event("HERMES.OBJECTIVE",{
    missionId:mission.id,
    objective,
    plan
  });

  plan.forEach((step,i)=>{
    const task=createTask(step,mission.id);
    mission.tasks.push(task.id);
  });

  return mission;
}

/* =========================================================
   API
========================================================= */

app.get("/api/health",(req,res)=>{
  res.json({
    ok:true,
    system:"HERMES",
    agents:300,
    status:"ONLINE",
    timestamp:new Date().toISOString()
  });
});

app.get("/api/company",(req,res)=>{
  res.json({
    name:"AI Company OS",
    orchestrator:"Hermes",
    agents,
    departments,
    sops,
    missions:state.missions,
    metrics:{
      leads:state.leads,
      customers:state.customers,
      dailyRevenue:state.dailyRevenue,
      mrr:state.mrr
    }
  });
});

app.get("/api/agents",(req,res)=>{
  const department=req.query.department;

  res.json(
    department
      ? agents.filter(a=>a.department.toLowerCase()===department.toLowerCase())
      : agents
  );
});

app.get("/api/agents/:id",(req,res)=>{
  const agent=agents.find(a=>a.id===req.params.id);

  if(!agent) return res.status(404).json({error:"Agent not found"});

  res.json(agent);
});

app.get("/api/missions",(req,res)=>{
  res.json(state.missions);
});

app.get("/api/tasks",(req,res)=>{
  res.json(state.tasks.slice(0,100));
});

app.get("/api/activity",(req,res)=>{
  res.json(state.activity.slice(0,100));
});

app.get("/api/revenue",(req,res)=>{
  res.json({
    dailyRevenue:state.dailyRevenue,
    mrr:state.mrr,
    customers:state.customers,
    leads:state.leads,
    revenueEvents:state.revenueEvents.slice(0,100)
  });
});

app.get("/api/approvals",(req,res)=>{
  res.json(state.approvals.filter(x=>x.status==="AWAITING_APPROVAL"));
});

app.post("/api/hermes",(req,res)=>{
  const objective=req.body.task || req.body.objective;

  if(!objective){
    return res.status(400).json({
      error:"Provide task or objective"
    });
  }

  const mission=delegateObjective(objective);

  res.json({
    agent:"Hermes",
    status:"delegated",
    mission
  });
});

app.post("/api/tasks",(req,res)=>{
  if(!req.body.task){
    return res.status(400).json({error:"task required"});
  }

  const task=createTask(req.body.task);

  res.json(task);
});

app.post("/api/approvals/:id/approve",(req,res)=>{
  const task=state.tasks.find(x=>x.id===req.params.id);

  if(!task){
    return res.status(404).json({error:"Task not found"});
  }

  task.status="APPROVED";

  const index=state.approvals.findIndex(x=>x.id===task.id);

  if(index>=0) state.approvals.splice(index,1);

  event("APPROVAL.GRANTED",{
    taskId:task.id,
    agent:task.agent,
    objective:task.objective
  });

  executeTask(task);

  res.json(task);
});

app.post("/api/approvals/:id/reject",(req,res)=>{
  const task=state.tasks.find(x=>x.id===req.params.id);

  if(!task){
    return res.status(404).json({error:"Task not found"});
  }

  task.status="REJECTED";

  event("APPROVAL.REJECTED",{
    taskId:task.id,
    agent:task.agent,
    objective:task.objective
  });

  res.json(task);
});

/* =========================================================
   LEAD + REVENUE EVENTS
========================================================= */

app.post("/api/leads",(req,res)=>{
  state.leads++;

  const lead={
    id:crypto.randomUUID(),
    name:req.body.name || "Inbound Prospect",
    source:req.body.source || "website",
    createdAt:new Date().toISOString()
  };

  event("LEAD.CREATED",{
    lead,
    agent:"Hermes"
  });

  createTask(`Research and qualify new lead ${lead.id}`);

  res.status(201).json(lead);
});

app.post("/api/revenue/event",(req,res)=>{
  const amount=Number(req.body.amount || 0);

  if(!Number.isFinite(amount) || amount <= 0){
    return res.status(400).json({error:"Valid positive amount required"});
  }

  const revenueEvent={
    id:crypto.randomUUID(),
    amount,
    type:req.body.type || "sale",
    source:req.body.source || "unknown",
    timestamp:new Date().toISOString()
  };

  state.dailyRevenue += amount;

  if(revenueEvent.type==="recurring"){
    state.mrr += amount;
  }

  state.revenueEvents.unshift(revenueEvent);

  event("REVENUE.CREATED",{
    revenueEvent,
    dailyRevenue:state.dailyRevenue,
    mrr:state.mrr
  });

  res.status(201).json(revenueEvent);
});

/* =========================================================
   LIVE EVENT STREAM
========================================================= */

app.get("/api/events",(req,res)=>{
  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.flushHeaders?.();

  subscribers.add(res);

  res.write(`data: ${JSON.stringify({
    type:"SYSTEM.CONNECTED",
    timestamp:new Date().toISOString(),
    agents:300
  })}\n\n`);

  req.on("close",()=>{
    subscribers.delete(res);
  });
});

/* =========================================================
   SIMULATED INTERNAL WORKLOAD
   This creates development activity only.
   It does NOT contact external people or spend money.
========================================================= */

setInterval(()=>{
  const agent=agents[Math.floor(Math.random()*agents.length)];

  event("AGENT.ACTIVITY",{
    agentId:agent.id,
    agent:agent.name,
    department:agent.department,
    action:[
      "analyzing opportunity",
      "processing knowledge",
      "evaluating lead",
      "checking workflow",
      "measuring funnel",
      "updating internal analysis"
    ][Math.floor(Math.random()*6)]
  });
},2200);

/* =========================================================
   START
========================================================= */

app.listen(PORT,()=>{
  console.log(`HERMES AI Company OS API: http://localhost:${PORT}`);
  console.log(`300 agents online`);
  console.log(`SSE event stream: http://localhost:${PORT}/api/events`);
});
