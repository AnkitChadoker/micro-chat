import { Queue } from "bullmq";
import { redisConnection as connection } from "../config";

export enum QueueEnum {
  PROCESS_MESSAGE = "process-message",
}

export const processMessageQueue = new Queue(QueueEnum.PROCESS_MESSAGE, {
  connection,
});
