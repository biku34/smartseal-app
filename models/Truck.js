import mongoose from "mongoose";

/**
 * Truck document stored in MongoDB.
 *
 * Created by a logistics partner to register the vehicles in their fleet.
 * Owned by the partner user; truck numbers are unique per owner.
 */
const TruckSchema = new mongoose.Schema(
  {
    truckId: { type: String, required: true, unique: true, index: true },

    // Owner — the logistics partner, derived from the auth cookie (never the client).
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    ownerUsername: { type: String },
    ownerUserId: { type: String, index: true },

    // Details
    truckNumber: { type: String, required: true, trim: true },
    type: { type: String, default: "" }, // e.g. Container, Flatbed, Refrigerated
    capacity: { type: String, default: "" }, // e.g. "10 tonnes"
    driverName: { type: String, default: "" },
    driverPhone: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// A given partner can't register the same truck number twice.
TruckSchema.index({ owner: 1, truckNumber: 1 }, { unique: true });

export default mongoose.models.Truck || mongoose.model("Truck", TruckSchema);
