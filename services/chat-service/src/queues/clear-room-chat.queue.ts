import mongoose from "mongoose";
import { clearRoomChatQueue, QueueEnum } from ".";

export interface IClearRoomChat {
  roomId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
}

export async function clearRoomChatJob(data: IClearRoomChat) {
  await clearRoomChatQueue.add(QueueEnum.CLEAR_ROOM_CHAT, data);
}
