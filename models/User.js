import mongoose from "mongoose";

/**
 * User document stored in MongoDB.
 *
 * Asked from the user at sign-up: name, email, username, orgName, password.
 * Assigned automatically by the server: userId, orgId, role, stage, active, createdAt.
 *
 * `role` defaults to "manufacturer"; an admin can change it later.
 */
const UserSchema = new mongoose.Schema(
  {
    // Auto-assigned identifiers
    userId: { type: String, required: true, unique: true, index: true },
    orgId: { type: String, required: true, index: true },

    // Provided by the user
    name: { type: String, required: [true, "Name is required."], trim: true },
    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      trim: true,
      lowercase: true,
    },
    username: {
      type: String,
      required: [true, "Username is required."],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, "Username must be at least 3 characters."],
    },
    orgName: {
      type: String,
      required: [true, "Organization name is required."],
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required."],
    },

    // Role / lifecycle
    role: {
      type: String,
      enum: ["manufacturer", "distributor", "retailer", "admin"],
      default: "manufacturer",
    },
    stage: {
      type: String,
      default: "Manufacturer",
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", UserSchema);
