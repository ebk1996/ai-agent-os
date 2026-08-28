const mongoose = require("mongoose");

const appRecordSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    slug: { type: String, required: true, index: true },
    collection: { type: String, default: "items", index: true },
    data: { type: Object, default: {} }
  },
  { timestamps: true, id: false }
);

module.exports = mongoose.models.AppRecord || mongoose.model("AppRecord", appRecordSchema);
