const mongoose = require("mongoose");

const missionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: String,
    objective: { type: String, required: true },
    target: String,
    status: { type: String, default: "ACTIVE", index: true },
    progress: { type: Number, default: 0 },
    plan: { type: [String], default: [] },
    taskIds: { type: [String], default: [] },
    agents: { type: Number, default: 0 }
  },
  { timestamps: true, id: false }
);

module.exports =
  mongoose.models.Mission || mongoose.model("Mission", missionSchema);
