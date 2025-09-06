import mongoose from "mongoose";
import { handleLastMessageQueue, QueueEnum } from ".";

export interface IHandleLastMessage {
  roomId: mongoose.Types.ObjectId;
  insertedMessageId?: mongoose.Types.ObjectId;
  deletedMessageId?: mongoose.Types.ObjectId;
}

export async function handleLastMessageJob(data: IHandleLastMessage) {
  await handleLastMessageQueue.add(QueueEnum.HANDLE_LAST_MESSAGE, data);
}
