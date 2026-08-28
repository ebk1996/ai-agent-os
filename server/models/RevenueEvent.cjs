const mongoose = require("mongoose");

const revenueEventSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    stripeId: { type: String, unique: true, sparse: true, index: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    type: { type: String, default: "sale" },
    source: { type: String, default: "stripe" },
    status: { type: String, default: "succeeded" },
    customerEmail: String,
    description: String,
    offerId: String,
    livemode: { type: Boolean, default: true },
    raw: { type: Object, default: {} }
  },
  { timestamps: true, id: false }
);

module.exports =
  mongoose.models.RevenueEvent ||
  mongoose.model("RevenueEvent", revenueEventSchema);
