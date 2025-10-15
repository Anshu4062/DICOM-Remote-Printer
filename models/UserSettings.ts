import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUserSettings extends Document {
  userId: Types.ObjectId;
  endpointId?: Types.ObjectId | null;
  settings: {
    anonymizeInstitutionName?: boolean;
    anonymizeInstitutionAddress?: boolean;
    anonymizePatientName?: boolean;
    anonymizePatientId?: boolean;
    anonymizeReferringPhysician?: boolean;
    anonymizeAccessionNumber?: boolean;
    customPrefix?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSettingsSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      unique: true,
      required: true,
    },
    endpointId: {
      type: Schema.Types.ObjectId,
      ref: "DicomEndpoint",
      default: null,
    },
    settings: {
      anonymizeInstitutionName: { type: Boolean, default: false },
      anonymizeInstitutionAddress: { type: Boolean, default: false },
      anonymizePatientName: { type: Boolean, default: false },
      anonymizePatientId: { type: Boolean, default: false },
      anonymizeReferringPhysician: { type: Boolean, default: false },
      anonymizeAccessionNumber: { type: Boolean, default: false },
      customPrefix: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

export default mongoose.models.UserSettings ||
  mongoose.model<IUserSettings>("UserSettings", UserSettingsSchema);
