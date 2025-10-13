import mongoose, { Document, Schema } from "mongoose";

export interface IDicomEndpoint extends Document {
  name: string; // human label
  calledAET: string;
  host: string;
  port: string;
  createdAt: Date;
  updatedAt: Date;
}

const DicomEndpointSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    calledAET: { type: String, required: true, trim: true },
    host: { type: String, required: true, trim: true },
    port: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.DicomEndpoint ||
  mongoose.model<IDicomEndpoint>("DicomEndpoint", DicomEndpointSchema);
