import mongoose, { Document, Schema } from "mongoose";

export interface IWeeklyReport extends Document {
  person: mongoose.Schema.Types.ObjectId;
  contacted: boolean;
  response: string;
  weekOf: Date; // To track which week this report belongs to
  reportedBy: mongoose.Schema.Types.ObjectId; // User who submitted the report
}

const WeeklyReportSchema: Schema = new Schema(
  {
    person: { type: Schema.Types.ObjectId, ref: "Person", required: true },
    contacted: { type: Boolean, required: true },
    response: { type: String, required: true },
    weekOf: { type: Date, required: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

WeeklyReportSchema.index({ person: 1 });
WeeklyReportSchema.index({ reportedBy: 1 });
WeeklyReportSchema.index({ weekOf: -1 });
WeeklyReportSchema.index({ person: 1, weekOf: -1 });

export default mongoose.model<IWeeklyReport>(
  "WeeklyReport",
  WeeklyReportSchema
);
