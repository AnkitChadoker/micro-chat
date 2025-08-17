import mongoose, { Document } from "mongoose";

export const MESSAGE_MODEL_NAME = "Message";
export const MESSAGE_COLLECTION_NAME = "messages";

export enum MessageType {
  SYSTEM = "system",
  MANUAL = "manual",
}

export interface IMessage extends Document {
  roomId: mongoose.Types.ObjectId;
  content: string;
  senderId: mongoose.Types.ObjectId;
  type: MessageType;
  createdAt?: Date;
}

const messageSchema = new mongoose.Schema<IMessage>(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Room",
    },
    content: { type: String, required: true },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(MessageType),
      default: MessageType.MANUAL,
    },
  },
  {
    timestamps: true,
    collection: MESSAGE_COLLECTION_NAME,
  }
);

messageSchema.index({ roomId: 1 });

export default mongoose.model<IMessage>(
  MESSAGE_MODEL_NAME,
  messageSchema,
  MESSAGE_COLLECTION_NAME
);
