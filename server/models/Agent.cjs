const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    number: Number,
    name: { type: String, required: true },
    role: { type: String, required: true },
    department: { type: String, required: true, index: true },
    skills: { type: [String], default: [] },
    status: { type: String, default: "IDLE", index: true },
    efficiency: { type: Number, default: 80 },
    tasksCompleted: { type: Number, default: 0 },
    revenueAttributed: { type: Number, default: 0 },
    currentTask: { type: String, default: null },
    lastOutput: { type: String, default: "" },
    permissions: {
      research: { type: Boolean, default: true },
      draft: { type: Boolean, default: true },
      analyze: { type: Boolean, default: true },
      external_write: { type: Boolean, default: false },
      financial_action: { type: Boolean, default: false }
    }
  },
  { timestamps: true, id: false }
);

module.exports = mongoose.models.Agent || mongoose.model("Agent", agentSchema);
