import mongoose from "mongoose";

/**
 * Logistics document stored in MongoDB.
 *
 * Created when a distributor pushes a marketplace product into the Logistics
 * section ("Manage Logistics"). It snapshots the product's metadata at push
 * time, records who pushed it, and carries the editable logistics-planning
 * fields (shipment planning, status workflow, cost/quantity allocation).
 *
 * One row per (distributor, productId): pushing the same product again updates
 * the existing row rather than creating a duplicate.
 */
const LogisticsSchema = new mongoose.Schema(
  {
    logisticsId: { type: String, required: true, unique: true, index: true },

    // Who pushed it — derived from the authenticated distributor, never the client.
    distributor: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    distributorUsername: { type: String },
    distributorUserId: { type: String, index: true },

    // --- Product snapshot (all metadata captured at push time) ---
    productId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    category: { type: String, default: "Electronics" },
    sku: { type: String },
    batch: { type: String },
    quantity: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    company: { type: String },
    manufacturer: { type: String },
    location: { type: String },
    mfg: { type: String },
    exp: { type: String },
    desc: { type: String },
    productStatus: { type: String },
    transactionId: { type: String },
    images: { type: [String], default: [] },

    // --- Logistics planning (frontend-editable for now) ---
    // Shipment planning fields
    carrier: { type: String, default: "" },
    origin: { type: String, default: "" },
    destination: { type: String, default: "" },
    dispatchDate: { type: String, default: "" },
    etaDate: { type: String, default: "" },
    mode: { type: String, default: "Road" }, // Road | Rail | Air | Sea
    trackingNo: { type: String, default: "" },

    // Assigned logistics partner (chosen by the distributor on submit)
    assignedPartnerId: { type: String, default: "", index: true },
    assignedPartnerUsername: { type: String, default: "" },
    assignedPartnerOrg: { type: String, default: "" },

    // Status workflow ("Draft" until the distributor submits the shipment plan)
    status: {
      type: String,
      enum: ["Draft", "Planned", "Dispatched", "In Transit", "Delivered"],
      default: "Draft",
    },
    submitted: { type: Boolean, default: false },

    // Cost & quantity allocation
    shipQuantity: { type: Number, default: 0 },
    freightCost: { type: Number, default: 0 },

    pushedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Prevent the same product being pushed twice by the same distributor.
LogisticsSchema.index({ distributor: 1, productId: 1 }, { unique: true });

export default mongoose.models.Logistics || mongoose.model("Logistics", LogisticsSchema);
