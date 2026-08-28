const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, default: "" },
    company: { type: String, default: "" },
    source: { type: String, default: "agent" },
    status: { type: String, default: "new" },
    value: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    agentId: String
  },
  { timestamps: true, id: false }
);

module.exports = mongoose.models.Lead || mongoose.model("Lead", leadSchema);
