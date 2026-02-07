import mongoose, { Document, Schema } from "mongoose";

export interface IPerson extends Document {
  name: string;
  phone: string;
  address: string;
  inviter: string;
  notes: string;
  // Link to the user who created this person
  createdBy: mongoose.Schema.Types.ObjectId;
}

const PersonSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    inviter: { type: String, required: true },
    notes: { type: String, required: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

PersonSchema.index({ createdBy: 1 });
PersonSchema.index({ name: 1 });
PersonSchema.index({ phone: 1 });
PersonSchema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.model<IPerson>("Person", PersonSchema);
