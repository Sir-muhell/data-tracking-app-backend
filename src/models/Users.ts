import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  username: string;
  passwordHash?: string;
  role: "user" | "admin";
  email?: string; // Used for unique identification in OAuth flows
  googleId?: string; // Used to link to the Google user
}

const UserSchema: Schema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
    },

    passwordHash: { type: String, required: false },

    // New fields for Google OAuth integration
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  {
    // Adding timestamps is a standard best practice for auditing
    timestamps: true,
  }
);

export default mongoose.model<IUser>("User", UserSchema);
