import mongoose, { Document, mongo } from "mongoose";
import { MESSAGE_COLLECTION_NAME } from "./message.model";

export const ROOM_MODEL_NAME = "Room";
export const ROOM_COLLECTION_NAME = "rooms";

export interface IRoom extends Document {
  name?: string;
  description?: string;
  isPrivate: boolean;
  ownerId: mongoose.Types.ObjectId;
  pendingMemberId?: mongoose.Types.ObjectId; // or private room only
  onlyAdminCanSendMessages: boolean;
  stats?: {
    totalMembers?: number;
    lastActivityAt?: Date;
    lastActedUserId?: mongoose.Types.ObjectId;
  };
}

const roomSchema = new mongoose.Schema<IRoom>(
  {
    name: { type: String },
    description: { type: String },
    isPrivate: { type: Boolean, default: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    pendingMemberId: { type: mongoose.Schema.Types.ObjectId },
    onlyAdminCanSendMessages: { type: Boolean, default: false },
    stats: {
      totalMembers: { type: Number, default: 0 },
      lastActivityAt: { type: Date },
      lastActedUserId: {
        type: mongoose.Schema.Types.ObjectId,
      },
    },
  },
  {
    timestamps: true,
    collection: ROOM_COLLECTION_NAME,
  }
);

export default mongoose.model<IRoom>(
  ROOM_MODEL_NAME,
  roomSchema,
  ROOM_COLLECTION_NAME
);
