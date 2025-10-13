import mongoose, { Schema, Document } from "mongoose";

export interface IAnonymizationSettings extends Document {
  userId: string;
  settings: {
    compressImages?: boolean;
    anonymizeInstitutionName?: boolean;
    anonymizeInstitutionAddress?: boolean;
    anonymizePatientName?: boolean;
    anonymizePatientId?: boolean;
    anonymizeReferringPhysician?: boolean;
    generateXML?: boolean;
    anonymizeAccessionNumber?: boolean;
    customPrefix?: string;
    defaultPrefix?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AnonymizationSettingsSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  settings: {
    compressImages: {
      type: Boolean,
      default: false,
    },
    anonymizeInstitutionName: {
      type: Boolean,
      default: false,
    },
    anonymizeInstitutionAddress: {
      type: Boolean,
      default: false,
    },
    anonymizePatientName: {
      type: Boolean,
      default: false,
    },
    anonymizePatientId: {
      type: Boolean,
      default: false,
    },
    anonymizeReferringPhysician: {
      type: Boolean,
      default: false,
    },
    generateXML: {
      type: Boolean,
      default: false,
    },
    anonymizeAccessionNumber: {
      type: Boolean,
      default: false,
    },
    customPrefix: {
      type: String,
      default: "",
    },
    defaultPrefix: {
      type: String,
      default: "***",
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
AnonymizationSettingsSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.AnonymizationSettings ||
  mongoose.model<IAnonymizationSettings>(
    "AnonymizationSettings",
    AnonymizationSettingsSchema
  );
