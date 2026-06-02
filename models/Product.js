import mongoose from "mongoose";

/**
 * Product document stored in MongoDB.
 *
 * `productId` is a human-readable unique code (e.g. "PRD-1A2B3C4D") that is also
 * used as the file name for the product's uploaded photo(s) on disk.
 * `images` holds the public URL paths to those saved files
 * (e.g. "/uploads/products/PRD-1A2B3C4D.png").
 */
const ProductSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, unique: true, index: true },

    // Ownership — derived from the authenticated user, never the client.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ownerUsername: { type: String },

    // Core / category
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "Electronics" },
    sku: { type: String, required: true, trim: true },
    batch: { type: String, trim: true },

    // Quantitative
    quantity: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    company: { type: String, trim: true },

    // Warehousing
    location: { type: String, trim: true },
    mfg: { type: String },
    exp: { type: String },
    desc: { type: String, default: "No description provided." },

    // Ledger / logistics (assigned server-side)
    status: {
      type: String,
      enum: ["Success", "Failed", "Pending"],
      default: "Pending",
    },
    transactionId: { type: String },
    pickupDate: { type: String },
    picked: { type: Boolean, default: false },

    // QR payload: transactionId encrypted with the uploader's userId.
    ownerUserId: { type: String },
    qrToken: { type: String },

    // Public URL paths to the saved photo files
    images: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.Product || mongoose.model("Product", ProductSchema);
