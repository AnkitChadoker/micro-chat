import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { fulfilled, rejected } from "../utils/response.util";
import MessageModel, { MessageType } from "../models/message.model";
import mongoose, { PipelineStage } from "mongoose";
import { processMessageJob } from "../queues/process-message.queue";
import RoomModel, { IRoom, ROOM_MODEL_NAME } from "../models/room.model";
import MessageStatusModel, {
  MESSAGE_STATUS_COLLECTION_NAME,
} from "../models/message-status.model";
import { getUsers } from "../utils/user.util";

export const list = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { page, limit } = req.body;

    const pipeline: PipelineStage[] = [
      {
        $match: {
          roomId: new mongoose.Types.ObjectId(roomId),
          type: { $ne: MessageType.REACTION },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: MESSAGE_STATUS_COLLECTION_NAME,
          let: { msgId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$messageId", "$$msgId"] },
                    {
                      $eq: [
                        "$userId",
                        new mongoose.Types.ObjectId(req.user!._id),
                      ],
                    },
                  ],
                },
              },
            },
            {
              $project: {
                sentAt: 1,
                deliveredAt: 1,
                seenAt: 1,
                reaction: "$reaction.emoji",
              },
            },
          ],
          as: "messageStatus",
        },
      },
      {
        $unwind: "$messageStatus",
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            ...(page && limit
              ? [{ $skip: (page - 1) * limit }, { $limit: limit }]
              : []),
          ],
        },
      },
    ];
    const result = await MessageModel.aggregate(pipeline);
    const messages = result[0]?.data || [];
    const total = result[0]?.metadata[0]?.total || 0;

    const userIdsToFetch = new Set<string>();

    messages.forEach((message: Record<string, any>) => {
      if (message.senderId) {
        userIdsToFetch.add(message.senderId.toString());
      }
    });
    const users = await getUsers([...userIdsToFetch]);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const enrichedMessages = messages.map((message: Record<string, any>) => {
      const sender = userMap.get(message.senderId?.toString() || "");

      const { senderId, ...restMessage } = message;
      return {
        ...restMessage,
        sender,
      };
    });

    return res.status(200).json(
      fulfilled("Messages fetched successfully.", {
        messages: enrichedMessages,
        total,
      })
    );
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

export const react = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { messageId } = req.params;
    const { emoji } = req.body;

    const message = await MessageModel.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
    }).populate<{ roomId: IRoom }>({ path: "roomId", model: ROOM_MODEL_NAME });
    if (!message) return res.status(404).json(rejected("Message not found."));

    const messageStatus = await MessageStatusModel.findOne({
      messageId: new mongoose.Types.ObjectId(messageId),
      userId: new mongoose.Types.ObjectId(req.user!._id),
    });
    if (!messageStatus)
      return res.status(404).json(rejected("Message not found."));

    let isNewReaction = false;
    const previousReaction = messageStatus.reaction;
    if (previousReaction) {
      if (previousReaction.emoji === emoji) {
        await MessageStatusModel.updateOne(
          { _id: messageStatus._id },
          { $unset: { reaction: 1 } }
        ).session(session);

        await MessageModel.updateOne(
          {
            _id: messageStatus.messageId,
            "stats.reactions.emoji": previousReaction.emoji,
          },
          { $inc: { "stats.reactions.$.count": -1 } }
        ).session(session);
      } else {
        isNewReaction = true;
        await MessageModel.updateOne(
          {
            _id: messageStatus.messageId,
            "stats.reactions.emoji": previousReaction.emoji,
          },
          { $inc: { "stats.reactions.$.count": -1 } }
        ).session(session);

        const existed = await MessageModel.updateOne(
          { _id: messageStatus.messageId, "stats.reactions.emoji": emoji },
          { $inc: { "stats.reactions.$.count": 1 } }
        ).session(session);
        if (!existed.modifiedCount) {
          await MessageModel.updateOne(
            { _id: messageStatus.messageId },
            { $push: { "stats.reactions": { emoji, count: 1 } } }
          ).session(session);
        }
        await MessageStatusModel.updateOne(
          { _id: messageStatus._id },
          {
            $set: { "reaction.emoji": emoji, "reaction.reactedAt": new Date() },
          }
        ).session(session);
      }

      await MessageModel.updateOne(
        { _id: messageStatus.messageId },
        { $pull: { "stats.reactions": { count: { $lte: 0 } } } }
      ).session(session);

      // clear previous reaction related data first
      await MessageModel.deleteOne({
        _id: messageStatus?.reaction?.messageReactionId,
      }).session(session);
      await MessageStatusModel.deleteMany({
        messageId: messageStatus?.reaction?.messageReactionId,
      }).session(session);

      if (
        messageStatus?.reaction?.messageReactionId?.toString() ===
        message.roomId?.stats?.lastMessageId?.toString()
      ) {
        const findMessage = await MessageModel.findOne({
          groupId: message.roomId._id,
        })
          .sort({ createdAt: -1 })
          .session(session);
        if (findMessage) {
          await RoomModel.updateOne(
            { _id: message.roomId._id },
            {
              "stats.lastMessageId": findMessage?._id,
            }
          ).session(session);
        }
      }
    } else {
      isNewReaction = true;
      await MessageStatusModel.updateOne(
        { _id: messageStatus._id },
        { $set: { "reaction.emoji": emoji, "reaction.reactedAt": new Date() } }
      ).session(session);

      const existed = await MessageModel.updateOne(
        { _id: message._id, "stats.reactions.emoji": emoji },
        { $inc: { "stats.reactions.$.count": 1 } }
      ).session(session);
      if (!existed.modifiedCount) {
        await MessageModel.updateOne(
          { _id: message._id },
          { $push: { "stats.reactions": { emoji, count: 1 } } }
        ).session(session);
      }
    }

    if (isNewReaction) {
      const messageDoc = await new MessageModel({
        content: `reacted ${emoji}`,
        senderId: req.user!._id,
        roomId: message.roomId._id,
        reactedMessageId: message._id,
        type: MessageType.REACTION,
      }).save({ session });

      await MessageStatusModel.updateOne(
        { _id: messageStatus._id },
        { "reaction.messageReactionId": messageDoc._id }
      ).session(session);

      await processMessageJob({
        messageId: messageDoc._id as mongoose.Types.ObjectId,
        roomId: message.roomId._id as mongoose.Types.ObjectId,
        senderId: new mongoose.Types.ObjectId(req.user!._id),
      });

      await RoomModel.findOneAndUpdate(
        { _id: message.roomId._id },
        { "stats.lastMessageId": messageDoc._id }
      ).session(session);
    }
    await session.commitTransaction();
    return res.status(200).json(fulfilled("Reaction sent successfully."));
  } catch (error) {
    await session.abortTransaction();
    console.log(error);
    return res.status(500).json(rejected("Reaction could not be sent."));
  } finally {
    await session.endSession();
  }
};

export const reactions = async (req: AuthRequest, res: Response) => {
  try {
    const { limit, page, emoji } = req.body;
    const { messageId } = req.params;

    const pipeline: PipelineStage[] = [
      {
        $match: {
          messageId: new mongoose.Types.ObjectId(messageId),
          "reaction.emoji": { $exists: true },
          ...(emoji ? { "reaction.emoji": emoji } : {}),
        },
      },
      {
        $sort: { "reaction.reactedAt": -1 },
      },
      {
        $project: {
          userId: 1,
          emoji: "$reaction.emoji",
          reactedAt: "$reaction.reactedAt",
        },
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            ...(page && limit
              ? [{ $skip: (page - 1) * limit }, { $limit: limit }]
              : []),
          ],
        },
      },
    ];
    const result = await MessageStatusModel.aggregate(pipeline);
    const reactions = result[0]?.data || [];
    const total = result[0]?.metadata[0]?.total || 0;

    const userIdsToFetch = new Set<string>();

    reactions.forEach((reaction: Record<string, any>) => {
      if (reaction.userId) {
        userIdsToFetch.add(reaction.userId.toString());
      }
    });
    const users = await getUsers([...userIdsToFetch]);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const enrichedReactions = reactions.map((reaction: Record<string, any>) => {
      const user = userMap.get(reaction.userId?.toString() || "");

      const { userId, ...restReaction } = reaction;
      return {
        ...restReaction,
        user,
      };
    });

    return res.status(200).json(
      fulfilled("Reactions fetched successfully.", {
        reactions: enrichedReactions,
        total,
      })
    );
  } catch (error) {
    console.log(error);
    return res.status(500).json(rejected("Reactions could not be fetched."));
  }
};
