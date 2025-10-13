import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUserEndpoint extends Document {
  userId: Types.ObjectId;
  endpointId: Types.ObjectId;
  createdAt: Date;
}

const UserEndpointSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    endpointId: {
      type: Schema.Types.ObjectId,
      ref: "DicomEndpoint",
      index: true,
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

UserEndpointSchema.index({ userId: 1, endpointId: 1 }, { unique: true });

export default mongoose.models.UserEndpoint ||
  mongoose.model<IUserEndpoint>("UserEndpoint", UserEndpointSchema);
