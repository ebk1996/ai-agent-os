const mongoose = require("mongoose");

const approvalSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
    title: String,
    summary: String,
    taskId: String,
    agentId: String,
    agent: String,
    payload: { type: Object, default: {} },
    status: { type: String, default: "AWAITING_APPROVAL", index: true },
    decidedBy: String,
    decidedAt: Date,
    result: { type: Object, default: null }
  },
  { timestamps: true, id: false }
);

module.exports =
  mongoose.models.Approval || mongoose.model("Approval", approvalSchema);
