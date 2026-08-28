const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    link: { type: String, default: "" },
    read: { type: Boolean, default: false, index: true },
    meta: { type: Object, default: {} }
  },
  { timestamps: true, id: false }
);

module.exports =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
