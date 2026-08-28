const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    objective: { type: String, required: true },
    title: String,
    missionId: String,
    parentId: String,
    agentId: { type: String, index: true },
    agent: String,
    department: String,
    status: { type: String, default: "QUEUED", index: true },
    mode: { type: String, default: "autonomous" },
    result: String,
    error: String,
    artifacts: { type: Array, default: [] },
    stripeAction: { type: Object, default: null },
    provider: String,
    assignedAgent: String,
    priority: { type: String, default: "medium" }
  },
  { timestamps: true, id: false }
);

module.exports = mongoose.models.Task || mongoose.model("Task", taskSchema);
