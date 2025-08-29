import mongoose from "mongoose";
import { processMessageQueue, QueueEnum } from ".";

export interface IProcessMessage {
  messageId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
}

export async function processMessageJob(data: IProcessMessage) {
  await processMessageQueue.add(QueueEnum.PROCESS_MESSAGE, data, {
    attempts: 3,
    backoff: 2000,
  });
}
