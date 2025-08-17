import mongoose, { Document } from "mongoose";
import { ROOM_COLLECTION_NAME } from "./room.model";

export const ROOM_MEMBER_MODEL_NAME = "RoomMember";
export const ROOM_MEMBER_COLLECTION_NAME = "room_members";

export interface IRoomMember extends Document {
  userId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  joinedAt: Date;
  isAdmin: boolean;
}

const roomMemberSchema = new mongoose.Schema<IRoomMember>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: ROOM_COLLECTION_NAME,
    },
    joinedAt: { type: Date, default: Date.now },
    isAdmin: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: ROOM_MEMBER_COLLECTION_NAME,
  }
);

roomMemberSchema.index({ roomId: 1, userId: 1 }, { unique: true });
roomMemberSchema.index({ userId: 1 });
roomMemberSchema.index({ roomId: 1 });

export default mongoose.model<IRoomMember>(
  ROOM_MEMBER_MODEL_NAME,
  roomMemberSchema,
  ROOM_MEMBER_COLLECTION_NAME
);
