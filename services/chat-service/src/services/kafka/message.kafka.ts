import mongoose from "mongoose";
import { IMessage } from "../../models/message.model";
import { producer } from "../../config";

export const messageCreated = async (message: Partial<IMessage>) => {
  await producer.send({
    topic: "messages",
    messages: [
      {
        key: "messageCreated",
        value: JSON.stringify({
          event: "messageCreated",
          data: {
            _id: message._id as string,
            senderId: message.senderId?.toString(),
            roomId: message.roomId?.toString(),
            content: message.content,
            createdAt: message.createdAt,
          },
        }),
      },
    ],
  });
};

export const messageDeleted = async (id: mongoose.Types.ObjectId) => {
  await producer.send({
    topic: "messages",
    messages: [
      {
        key: "messageDeleted",
        value: JSON.stringify({
          event: "messageDeleted",
          data: { _id: id.toString() },
        }),
      },
    ],
  });
};
