import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { fulfilled, rejected } from "../utils/response.util";
import MessageModel from "../models/message.model";
import mongoose from "mongoose";
import { processMessageJob } from "../queues/process-message.queue";
import RoomModel from "../models/room.model";

export const list = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { page, limit } = req.body;
  } catch (error) {
    console.log(error);
    return res.status(500).json(rejected("Messages could not be fetched"));
  }
};

export const send = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { roomId } = req.params;
    const { content } = req.body;

    const newMessage = new MessageModel({
      roomId: new mongoose.Types.ObjectId(roomId),
      content,
      senderId: new mongoose.Types.ObjectId(req.user!._id),
    });
    await newMessage.save({ session });

    await processMessageJob({
      messageId: newMessage._id as mongoose.Types.ObjectId,
      roomId: new mongoose.Types.ObjectId(roomId),
      senderId: new mongoose.Types.ObjectId(req.user!._id),
    });

    await RoomModel.updateOne(
      { _id: new mongoose.Types.ObjectId(roomId) },
      {
        stats: {
          lastActivityAt: new Date(),
          lastMessageId: newMessage._id as mongoose.Types.ObjectId,
          lastActedUserId: new mongoose.Types.ObjectId(req.user!._id),
        },
      },
      { session }
    );
    await session.commitTransaction();
    return res.status(200).json(
      fulfilled("Message sent successfully.", {
        message: newMessage,
      })
    );
  } catch (error) {
    await session.abortTransaction();
    console.log(error);
    return res.status(500).json(rejected("Message could not be sent."));
  } finally {
    session.endSession();
  }
};
