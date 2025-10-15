import mongoose, { Schema, Document } from "mongoose";

export interface IImageHistory extends Document {
  userId: string;
  filename: string;
  action: "uploaded" | "sent" | "received";
  metadata: {
    zip?: boolean;
    fileCount?: number;
    files?: string[];
    patientName?: string;
    patientId?: string;
    patientSex?: string;
    patientBirthDate?: string;
    modality?: string;
    studyDate?: string;
    studyTime?: string;
    studyDescription?: string;
    seriesNumber?: string;
    seriesDescription?: string;
    bodyPartExamined?: string;
    instanceNumber?: string;
    rows?: string;
    columns?: string;
    manufacturer?: string;
    manufacturerModelName?: string;
    stationName?: string;
    institutionName?: string;
    institutionalDepartmentName?: string;
    referringPhysicianName?: string;
    sequenceName?: string;
  };
  endpoint?: {
    callingAET: string;
    calledAET: string;
    host: string;
    port: string;
  };
  createdAt: Date;
}

const ImageHistorySchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  filename: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    required: true,
    enum: ["uploaded", "sent", "received"],
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
  endpoint: {
    type: Schema.Types.Mixed,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

export default mongoose.models.ImageHistory ||
  mongoose.model<IImageHistory>("ImageHistory", ImageHistorySchema);
