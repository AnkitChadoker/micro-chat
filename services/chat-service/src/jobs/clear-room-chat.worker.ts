import { Worker } from "bullmq";
import { QueueEnum } from "../queues";
import { redisConnection as connection } from "../config";
import MessageStatusModel from "../models/message-status.model";
import mongoose, { PipelineStage } from "mongoose";
import { IClearRoomChat } from "../queues/clear-room-chat.queue";
import { MESSAGE_COLLECTION_NAME } from "../models/message.model";

const BATCH_SIZE = 1000;
const worker = new Worker(
  QueueEnum.CLEAR_ROOM_CHAT,
  async (job) => {
    let { roomId, userId }: IClearRoomChat = job.data;

    const pipeline: PipelineStage[] = [
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          deleted: { $ne: true },
        },
      },
      {
        $lookup: {
          from: MESSAGE_COLLECTION_NAME,
          localField: "messageId",
          foreignField: "_id",
          as: "message",
        },
      },
      { $unwind: "$message" },
      {
        $match: {
          "message.roomId": new mongoose.Types.ObjectId(roomId),
        },
      },
      {
        $sort: { "message.createdAt": -1 },
      },
    ];
    const cursor = MessageStatusModel.aggregate(pipeline).cursor();
    let batch: any[] = [];
    let count = 0;

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      for await (const doc of cursor) {
        batch.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { deleted: true },
          },
        });

        if (batch.length === BATCH_SIZE) {
          await MessageStatusModel.bulkWrite(batch, {
            session,
          });
          count += batch.length;
          batch = [];
        }
      }

      if (batch.length > 0) {
        await MessageStatusModel.bulkWrite(batch, { session });
        count += batch.length;
      }

      await session.commitTransaction();
      console.log(`✅ deleted ${count} message statuses.`);
    } catch (error) {
      await session.abortTransaction();
      console.error("❌ Failed to deleted message statuses:", error);
      throw error;
    } finally {
      await session.endSession();
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`✅ clear room chat job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ clear room chat job ${job?.id} failed: ${err.message}`);
});
