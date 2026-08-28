const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    interval: { type: String, default: "one_time" },
    status: { type: String, default: "draft", index: true },
    agentId: String,
    agent: String,
    stripeProductId: String,
    stripePriceId: String,
    stripePaymentLinkId: String,
    paymentUrl: String,
    sales: { type: Number, default: 0 },
    revenueCents: { type: Number, default: 0 }
  },
  { timestamps: true, id: false }
);

module.exports = mongoose.models.Offer || mongoose.model("Offer", offerSchema);
