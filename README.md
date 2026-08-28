# Hermes AI Company OS

> **An AI-powered operating system for running, automating, and scaling an online business.**

Hermes AI Company OS is a full-stack AI business orchestration platform built around **Hermes**, a conductor agent responsible for coordinating hundreds of specialized AI agents.

The system combines **300 specialized agent configurations**, local AI through **Ollama**, cloud reasoning through **Google Gemini**, live agent activity visualization, business workflows, revenue intelligence, and approval-gated financial operations through **Stripe**.

The goal is simple:

> **Turn business objectives into coordinated AI workflows that continuously acquire customers, improve conversion, retain clients, analyze revenue, and automate operations — while keeping humans in control of consequential actions.**

---

## ✨ Core Features

### 🧠 Hermes AI Conductor

Hermes acts as the central orchestration layer.

Give Hermes an objective such as:

```text
Increase recurring revenue by $5,000 this month.
```

Hermes can decompose the objective into a series of specialized tasks:

```text
Objective
   ↓
Analyze Revenue
   ↓
Identify Opportunities
   ↓
Research Prospects
   ↓
Qualify Leads
   ↓
Analyze Funnel
   ↓
Identify Retention Opportunities
   ↓
Measure Results
```

Each task is assigned to an appropriate specialist agent.

---

# 🤖 300 AI Agents

The platform contains **300 specialized agent configurations**.

Agents are defined by:

* Role
* Department
* Skills
* Permissions
* Efficiency
* Task history
* Revenue attribution
* Current status

Examples include:

```text
Lead Hunter
Market Researcher
ICP Analyst
SEO Strategist
Content Architect
Social Agent
Campaign Agent
Sales Qualifier
Offer Architect
Sales Agent
CRM Agent
Customer Success Agent
Support Agent
Retention Agent
Bookkeeper
Invoice Agent
Finance Analyst
Growth Analyst
Funnel Agent
CRO Agent
Developer Agent
QA Agent
DevOps Agent
Security Agent
Strategy Agent
```

The architecture does **not** require 300 separate AI models.

Instead, hundreds of specialized agents share a smaller number of AI providers through Hermes' model router.

---

# 🧠 AI Model Router

Hermes currently supports two AI providers:

## Ollama

Used for local, inexpensive, and privacy-sensitive workloads.

Typical workloads:

* Classification
* Summarization
* Internal analysis
* Routine agent tasks
* Knowledge processing
* Lead categorization
* Background automation

Ollama runs locally and exposes its API through:

```text
http://127.0.0.1:11434
```

## Google Gemini

Used for more complex reasoning and strategic workloads.

Typical workloads:

* Strategic planning
* Revenue analysis
* Mission decomposition
* Complex reasoning
* Marketing strategy
* Sales strategy
* Business analysis
* Agent/tool selection

Hermes automatically routes tasks according to complexity.

```text
                 HERMES
                    │
             MODEL ROUTER
              /          \
             /            \
        OLLAMA           GEMINI
         LOCAL            CLOUD
           │                │
           └───────┬────────┘
                   │
              300 AGENTS
```

---

# 💰 Revenue Automation

The OS is designed around measurable business outcomes rather than simply generating AI activity.

Key business metrics include:

```text
Leads
Customers
Daily Revenue
MRR
Revenue Events
Agent Revenue Attribution
```

Revenue events can flow into the system through the API.

```text
Customer
   ↓
Payment
   ↓
Stripe
   ↓
Webhook
   ↓
Hermes
   ↓
Revenue Event
   ↓
MRR
   ↓
Growth Agents
```

This allows the AI system to make decisions based on actual business performance.

---

# 💳 Stripe Integration

Stripe is integrated as the financial system of record.

Hermes can safely access financial information such as:

* Balance
* Customers
* Subscriptions
* Revenue information

Financial actions are protected by an **approval gate**.

### Example

An agent determines:

```text
Transfer $500
```

Instead of immediately executing the action:

```text
Agent
  ↓
Stripe Tool
  ↓
Approval Required
  ↓
Human Review
  ↓
Approve / Reject
  ↓
Stripe
```

The AI therefore cannot independently move money simply because an LLM generated an instruction.

This architecture is intentionally designed around:

**AI autonomy + human financial control.**

---

# 🔐 Approval System

Consequential actions can enter:

```text
AWAITING_APPROVAL
```

Examples include:

* Financial transfers
* Stripe top-ups
* Refunds
* External publishing
* Sending outbound communications
* Destructive operations

The approval system provides a clear separation between:

### Autonomous

```text
Research
Analysis
Classification
Planning
Internal processing
```

### Human-assisted

```text
Campaign publication
Deployment
Financial preparation
External actions
```

### Human-controlled

```text
Money movement
High-impact financial actions
Destructive operations
```

---

# ⚡ Live Agent Event System

Hermes exposes a Server-Sent Events stream:

```text
GET /api/events
```

This allows the frontend to receive live agent activity.

Example events:

```text
LEAD.CREATED
TASK.CREATED
AGENT.WORKING
TASK.COMPLETED
AI.COMPLETED
REVENUE.CREATED
APPROVAL.REQUIRED
APPROVAL.GRANTED
APPROVAL.REJECTED
STRIPE.APPROVAL_REQUIRED
```

This powers the animated AI headquarters.

Instead of merely displaying fake animations, the UI can visualize actual backend events:

```text
LEAD.CREATED
      ↓
Lead Hunter
      ↓
Research Agent
      ↓
Qualification Agent
      ↓
CRM Agent
      ↓
Sales Workflow
      ↓
Customer
      ↓
Revenue
```

---

# 🏢 Company Departments

The OS organizes agents into business departments:

```text
Communications
Sales
Finance
Clients
Marketing
Growth
Tech
Strategy
```

Each department can contain:

* Agents
* Skills
* SOPs
* Workflows
* Missions
* Permissions
* Metrics

---

# 📋 SOP / Workflow Engine

Business operations can be represented as structured workflows.

Example:

## Qualify New Lead

```text
Research lead
      ↓
Score intent
      ↓
Identify ICP fit
      ↓
Prepare CRM record
```

Example:

## Marketing Campaign

```text
Research audience
      ↓
Create campaign
      ↓
Prepare assets
      ↓
Measure results
```

Example:

## Client Support

```text
Understand request
      ↓
Search knowledge
      ↓
Prepare resolution
      ↓
Verify outcome
```

---

# 🌐 API

The backend is built with:

* Node.js
* Express
* CommonJS backend modules
* REST APIs
* Server-Sent Events

## Health

```http
GET /api/health
```

## Company

```http
GET /api/company
```

## Agents

```http
GET /api/agents
GET /api/agents/:id
```

Filter agents:

```http
GET /api/agents?department=Sales
```

## Missions

```http
GET /api/missions
```

## Tasks

```http
GET /api/tasks
```

## Activity

```http
GET /api/activity
```

## Revenue

```http
GET /api/revenue
```

## Approvals

```http
GET /api/approvals
```

## Hermes

```http
POST /api/hermes
```

Example:

```json
{
  "task": "Increase recurring revenue by $5,000 this month"
}
```

## AI

```http
POST /api/ai
```

Example:

```json
{
  "prompt": "Analyze our current acquisition strategy."
}
```

Force Ollama:

```json
{
  "mode": "ollama",
  "prompt": "Classify this lead."
}
```

Force Gemini:

```json
{
  "mode": "gemini",
  "prompt": "Develop a strategy to increase MRR."
}
```

---

# 💳 Stripe API

Read Stripe balance:

```http
GET /api/stripe/balance
```

Retrieve a customer:

```http
GET /api/stripe/customers/:id
```

Retrieve a subscription:

```http
GET /api/stripe/subscriptions/:id
```

Prepare a financial action:

```http
POST /api/stripe/prepare
```

Example:

```json
{
  "action": "prepare_transfer",
  "params": {
    "amount": 500,
    "currency": "usd"
  }
}
```

The result is:

```json
{
  "status": "AWAITING_APPROVAL",
  "approvalRequired": true
}
```

---

# 🔑 Environment Variables

Create:

```text
.env
```

Example:

```env
GEMINI_API_KEY=your_gemini_key
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_WEBHOOK_SECRET=your_webhook_secret

OLLAMA_MODEL=gemma4
GEMINI_MODEL=your_supported_gemini_model

HERMES_REQUIRE_APPROVAL=true
```

**Never commit `.env` to Git.**

The `.gitignore` file should contain:

```text
.env
```

---

# 🚀 Installation

Clone the project:

```bash
git clone <your-repository-url>
cd ai-company-os
```

Install dependencies:

```bash
npm install
```

Install Ollama:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Verify:

```bash
ollama --version
```

Pull your local model:

```bash
ollama pull gemma4
```

Verify Ollama:

```bash
curl http://127.0.0.1:11434/api/version
```

Configure `.env`.

Then start the application:

```bash
npm run dev
```

The frontend runs through Vite and the API runs on:

```text
http://localhost:4000
```

---

# 🛠️ Development

Run the backend directly:

```bash
node server/index.cjs
```

Run Vite:

```bash
npm run dev
```

Build production frontend:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

Lint:

```bash
npm run lint
```

---

# 🧩 Project Structure

```text
ai-company-os/
│
├── server/
│   ├── index.cjs
│   └── ai.cjs
│
├── src/
│   ├── App.jsx
│   ├── App.css
│   ├── index.css
│   ├── style.css
│   └── assets/
│
├── public/
│
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── eslint.config.js
├── .gitignore
└── README.md
```

---

# 🎮 AI Headquarters

The frontend is designed as an interactive AI headquarters rather than a traditional administration dashboard.

The vision is to make the business feel like a living strategy game:

```text
                 HERMES HQ

 ┌───────────┐       ┌───────────┐
 │   SALES   │       │ MARKETING │
 │           │       │           │
 │ 🤖 🤖 🤖  │       │ 🤖 🤖 🤖  │
 └─────┬─────┘       └─────┬─────┘
       │                   │
       └─────────┬─────────┘
                 │
             ┌───▼───┐
             │HERMES │
             └───┬───┘
                 │
        ┌────────▼────────┐
        │     REVENUE     │
        │                 │
        │  $4,826 / day   │
        │  $18,740 MRR    │
        └─────────────────┘
```

Live backend events can drive:

* Agent movement
* Lead animations
* Task transitions
* Department activity
* Mission progress
* Revenue events
* Approval notifications

---

# 🧠 Design Philosophy

Hermes is designed around five principles.

### 1. Outcomes over activity

The system should optimize for measurable business outcomes.

```text
Revenue
MRR
Customers
Retention
Conversion
```

—not simply the number of AI messages generated.

### 2. Specialized agents

Instead of one giant AI prompt, specialized agents handle specific responsibilities.

### 3. Model flexibility

Agents should not be permanently tied to one model provider.

### 4. Human control

AI should automate work without silently taking consequential actions.

### 5. Observable automation

Every important action should generate an event that can be inspected and visualized.

---

# 🗺️ Roadmap

## Phase 1 — Foundation

* [x] Hermes orchestration API
* [x] 300 agent configurations
* [x] Departments
* [x] SOP definitions
* [x] Task system
* [x] Mission system
* [x] Live event stream
* [x] Ollama integration
* [x] Gemini integration
* [x] Stripe integration
* [x] Approval gates

## Phase 2 — Intelligence

* [ ] Persistent agent memory
* [ ] Company knowledge base
* [ ] Vector search
* [ ] Tool registry
* [ ] Agent-to-agent communication
* [ ] Long-running missions
* [ ] Agent performance evaluation
* [ ] Automated experiment selection

## Phase 3 — Business Automation

* [ ] CRM integration
* [ ] Email workflows
* [ ] Calendar workflows
* [ ] Customer onboarding
* [ ] Subscription management
* [ ] Lead enrichment
* [ ] Marketing analytics
* [ ] Customer health scoring
* [ ] Churn detection

## Phase 4 — Autonomous Growth

* [ ] Revenue opportunity detection
* [ ] Automated funnel experiments
* [ ] Lead prioritization
* [ ] Retention campaigns
* [ ] Upsell/cross-sell detection
* [ ] Automated reporting
* [ ] Revenue forecasting
* [ ] Mission optimization

## Phase 5 — Enterprise AI Company OS

* [ ] Multi-company support
* [ ] Role-based access control
* [ ] Agent permission management
* [ ] Audit logs
* [ ] Persistent databases
* [ ] Distributed workers
* [ ] Kubernetes deployment
* [ ] Production observability
* [ ] Multi-model routing
* [ ] Enterprise security

---

# 🔐 Security

The project is designed so that sensitive credentials remain server-side.

Never expose:

```text
GEMINI_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

to the React application.

Financial operations should always pass through the server-side approval layer.

The AI model should **never be trusted as an authorization mechanism**.

Permissions, approval requirements, and financial limits should be enforced by application code.

---

# ⚠️ Current Development Status

Hermes AI Company OS is an actively developed prototype/early-stage platform.

Some currently demonstrated activity is intentionally simulated for development and UI visualization.

Before using the system for production business automation:

* Add persistent storage
* Add authentication
* Add authorization
* Add audit logging
* Add production Stripe webhooks
* Add rate limiting
* Add model usage limits
* Add agent execution isolation
* Add proper financial authorization
* Add monitoring and alerting
* Test every external integration

**Do not treat generated AI output as authorization to perform financial or other high-impact actions.**

---

# 🎯 Vision

Hermes is intended to become a **business operating system**, not simply another AI chatbot.

The long-term architecture is:

```text
                         ┌───────────────┐
                         │    HERMES     │
                         │   CONDUCTOR   │
                         └───────┬───────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
            ACQUIRE          CONVERT          RETAIN
                │                │                │
                └────────────────┼────────────────┘
                                 │
                           ┌─────▼─────┐
                           │  REVENUE  │
                           └─────┬─────┘
                                 │
                           ┌─────▼─────┐
                           │    MRR    │
                           └─────┬─────┘
                                 │
                           ┌─────▼─────┐
                           │   HERMES  │
                           └───────────┘
```

The objective is a continuously improving business automation loop:

**Observe → Plan → Execute → Measure → Learn → Optimize.**

---

## License

Add your preferred license before publishing the repository.

---

## Built With

* React
* Vite
* Node.js
* Express
* Ollama
* Google Gemini
* Stripe
* Server-Sent Events

**Hermes AI Company OS — an AI-native operating system for the modern business.**
