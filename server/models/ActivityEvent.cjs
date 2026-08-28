const mongoose = require("mongoose");

const activityEventSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true },
    message: { type: String, default: "" },
    payload: { type: Object, default: {} },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true, id: false }
);

module.exports =
  mongoose.models.ActivityEvent ||
  mongoose.model("ActivityEvent", activityEventSchema);
