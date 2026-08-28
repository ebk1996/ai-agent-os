const mongoose = require("mongoose");

const siteSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    html: { type: String, required: true },
    kind: { type: String, default: "html" },
    files: { type: Array, default: [] },
    bundleJs: { type: String, default: "" },
    status: { type: String, default: "live", index: true },
    agentId: String,
    agent: String,
    taskId: String,
    offerId: String,
    url: String
  },
  { timestamps: true, id: false }
);

module.exports = mongoose.models.Site || mongoose.model("Site", siteSchema);
