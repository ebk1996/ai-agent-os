const mongoose = require("mongoose");

const workspaceMessageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    agentId: { type: String, required: true, index: true },
    taskId: String,
    role: { type: String, enum: ["user", "agent", "system"], required: true },
    content: { type: String, required: true },
    artifacts: { type: Array, default: [] }
  },
  { timestamps: true, id: false }
);

module.exports =
  mongoose.models.WorkspaceMessage ||
  mongoose.model("WorkspaceMessage", workspaceMessageSchema);
