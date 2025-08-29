import { Worker } from "bullmq";
import { QueueEnum } from "../queues";
import { redisConnection as connection } from "../config";
import { IProcessMessage } from "../queues/process-message.queue";
import RoomMemberModel from "../models/room-member.model";
import MessageStatusModel, {
  IMessageStatus,
} from "../models/message-status.model";
import mongoose from "mongoose";

const BATCH_SIZE = 1000;
const worker = new Worker(
  QueueEnum.PROCESS_MESSAGE,
  async (job) => {
    let { messageId, roomId, senderId }: IProcessMessage = job.data;

    const cursor = RoomMemberModel.find({ roomId }).select("userId").cursor();
    let batch: Partial<IMessageStatus>[] = [];
    let count = 0;

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      for await (const doc of cursor) {
        batch.push({
          messageId,
          userId: doc.userId,
          sentAt: new Date(),
          deliveredAt:
            doc.userId.toString() === senderId.toString()
              ? new Date()
              : undefined,
          seenAt:
            doc.userId.toString() === senderId.toString()
              ? new Date()
              : undefined,
        });

        if (batch.length === BATCH_SIZE) {
          await MessageStatusModel.insertMany(batch, {
            session,
            ordered: false,
          });
          count += batch.length;
          batch = [];
        }
      }

      if (batch.length > 0) {
        await MessageStatusModel.insertMany(batch, { session, ordered: false });
        count += batch.length;
      }

      await session.commitTransaction();
      console.log(`✅ Inserted ${count} message statuses.`);
    } catch (error) {
      await session.abortTransaction();
      console.error("❌ Failed to insert message statuses:", error);
      throw error;
    } finally {
      await session.endSession();
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`✅ process message ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ process message job ${job?.id} failed: ${err.message}`);
});
