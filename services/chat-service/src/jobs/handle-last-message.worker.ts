import { Worker } from "bullmq";
import { QueueEnum } from "../queues";
import { connectDB, redisConnection as connection } from "../config";
import RoomMemberModel from "../models/room-member.model";
import MessageStatusModel from "../models/message-status.model";
import mongoose, { PipelineStage } from "mongoose";
import { IHandleLastMessage } from "../queues/handle-last-message.queue";
import { MESSAGE_COLLECTION_NAME } from "../models/message.model";

const BATCH_SIZE = 1000;
const worker = new Worker(
  QueueEnum.HANDLE_LAST_MESSAGE,
  async (job) => {
    let { roomId, insertedMessageId, deletedMessageId }: IHandleLastMessage =
      job.data;

    if (insertedMessageId) {
      await RoomMemberModel.updateMany(
        { roomId },
        { lastMessageId: insertedMessageId }
      );
    }

    if (deletedMessageId) {
      const cursor = RoomMemberModel.find({ roomId })
        .select("userId lastMessageId")
        .cursor();
      let batch: any[] = [];
      let count = 0;

      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        for await (const doc of cursor) {
          if (doc.lastMessageId?.toString() !== deletedMessageId.toString())
            continue;
          let lastMessageId = null;
          const pipeline: PipelineStage[] = [
            {
              $match: {
                userId: doc.userId,
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
            {
              $limit: 1,
            },
          ];

          const [result] = await MessageStatusModel.aggregate(pipeline);

          if (result?.message?._id) {
            lastMessageId = result.message._id;
          }

          batch.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: { lastMessageId } },
            },
          });

          if (batch.length === BATCH_SIZE) {
            await RoomMemberModel.bulkWrite(batch, {
              session,
            });
            count += batch.length;
            batch = [];
          }
        }

        if (batch.length > 0) {
          await RoomMemberModel.bulkWrite(batch, {
            session,
          });
          count += batch.length;
        }

        await session.commitTransaction();
        console.log(`✅ Updated ${count} last message.`);
      } catch (error) {
        await session.abortTransaction();
        console.error("❌ Failed to update last message:", error);
        throw error;
      } finally {
        await session.endSession();
      }
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`✅ handle last message ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ handle last message job ${job?.id} failed: ${err.message}`);
});
