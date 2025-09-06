import { Queue } from "bullmq";
import { redisConnection as connection } from "../config";

export enum QueueEnum {
  PROCESS_MESSAGE = "process-message",
  HANDLE_LAST_MESSAGE = "handle-last-message",
  CLEAR_ROOM_CHAT = "clear-room-chat",
}

export const processMessageQueue = new Queue(QueueEnum.PROCESS_MESSAGE, {
  connection,
});

export const handleLastMessageQueue = new Queue(QueueEnum.HANDLE_LAST_MESSAGE, {
  connection,
});

export const clearRoomChatQueue = new Queue(QueueEnum.CLEAR_ROOM_CHAT, {
  connection,
});
