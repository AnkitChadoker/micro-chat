import mongoose, { Document } from "mongoose";

export const MESSAGE_STATUS_MODEL_NAME = "MessageStatus";
export const MESSAGE_STATUS_COLLECTION_NAME = "message_statuses";

export interface IMessageStatus extends Document {
  messageId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sentAt: Date;
  deliveredAt?: Date;
  seenAt?: Date;
  deleted?: boolean;
  reaction?: {
    emoji: string;
    reactedAt: Date;
    messageReactionId: mongoose.Types.ObjectId;
  };
}

const messageStatusSchema = new mongoose.Schema<IMessageStatus>(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sentAt: { type: Date, default: Date.now() },
    deliveredAt: { type: Date, default: null },
    seenAt: { type: Date, default: null },
    deleted: { type: Boolean },
    reaction: {
      type: {
        emoji: String,
        reactedAt: Date,
        messageReactionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: MESSAGE_STATUS_COLLECTION_NAME,
        },
      },
    },
  },
  {
    timestamps: true,
    collection: MESSAGE_STATUS_COLLECTION_NAME,
  }
);

messageStatusSchema.index({ userId: 1 });
messageStatusSchema.index({ messageId: 1 });
messageStatusSchema.index({ userId: 1, messageId: 1 }, { unique: true });

export default mongoose.model<IMessageStatus>(
  MESSAGE_STATUS_MODEL_NAME,
  messageStatusSchema,
  MESSAGE_STATUS_COLLECTION_NAME
);
