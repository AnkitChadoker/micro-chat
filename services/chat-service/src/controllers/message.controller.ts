import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { fulfilled, rejected } from "../utils/response.util";
import MessageModel, {
  MESSAGE_COLLECTION_NAME,
  MessageType,
} from "../models/message.model";
import mongoose, { PipelineStage } from "mongoose";
import RoomModel, {
  IRoom,
  ROOM_COLLECTION_NAME,
  ROOM_MODEL_NAME,
} from "../models/room.model";
import MessageStatusModel, {
  MESSAGE_STATUS_COLLECTION_NAME,
} from "../models/message-status.model";
import { getUser, getUserByUserName, getUsers } from "../utils/user.util";
import { processMessageJob } from "../queues/process-message.queue";
import { handleLastMessageJob } from "../queues/handle-last-message.queue";
import RoomMemberModel, {
  ROOM_MEMBER_COLLECTION_NAME,
} from "../models/room-member.model";
import { clearRoomChatJob } from "../queues/clear-room-chat.queue";

const buildMessagePipeline = ({
  roomId,
  userId,
  matchExtra = {},
  limit,
  sortOrder = -1, // -1 => newest first, 1 => oldest first
}: {
  roomId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  matchExtra?: Record<string, any>;
  limit?: number;
  sortOrder?: 1 | -1;
}): PipelineStage[] => {
  return [
    {
      $match: {
        roomId,
        type: { $ne: MessageType.REACTION },
        ...matchExtra,
      },
    },
    { $sort: { _id: sortOrder } },
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
                  { $eq: ["$userId", userId] },
                  { $ne: ["$deleted", true] },
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
    { $unwind: "$messageStatus" },
    ...(limit ? [{ $limit: limit }] : []),
  ];
};

export const list = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { cursor, limit = 20, initial } = req.body;

    const pipeline = buildMessagePipeline({
      roomId: new mongoose.Types.ObjectId(roomId),
      userId: new mongoose.Types.ObjectId(req.user!._id),
      matchExtra: cursor
        ? initial
          ? { _id: { $lte: new mongoose.Types.ObjectId(cursor) } }
          : { _id: { $lt: new mongoose.Types.ObjectId(cursor) } }
        : {},
      limit,
      sortOrder: -1,
    });

    const result = await MessageModel.aggregate(pipeline);
    const nextCursor = result.length ? result[result.length - 1]._id : null;

    const userIdsToFetch = new Set<string>();

    result.forEach((message: Record<string, any>) => {
      if (message.senderId) {
        userIdsToFetch.add(message.senderId.toString());
      }
      if (message.mentions) {
        message.mentions.forEach((mention: Record<string, any>) => {
          userIdsToFetch.add(mention.userId.toString());
        });
      }
    });
    const users = await getUsers([...userIdsToFetch]);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const enrichedMessages = result.map((message: Record<string, any>) => {
      const sender = userMap.get(message.senderId?.toString() || "");
      const { senderId, ...restMessage } = message;

      const enrichedMentions = (message.mentions || []).map(
        (mention: Record<string, any>) => {
          const mentionedUser = userMap.get(mention.userId?.toString() || "");
          return {
            ...mention,
            username: mentionedUser ? mentionedUser.username : null,
          };
        }
      );
      return {
        ...restMessage,
        sender,
        mentions: enrichedMentions,
      };
    });

    return res.status(200).json(
      fulfilled("Messages fetched successfully.", {
        messages: enrichedMessages,
        nextCursor,
        hasMore: !!nextCursor,
      })
    );
  } catch (error) {
    console.log(error);
    return res.status(500).json(rejected("Messages could not be fetched"));
  }
};

export const jumpOnMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId, limit = 20 } = req.body;
    const roomId = new mongoose.Types.ObjectId(req.params.roomId);
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const targetId = new mongoose.Types.ObjectId(messageId);

    const [beforeRaw, after, [target]] = await Promise.all([
      MessageModel.aggregate(
        buildMessagePipeline({
          roomId,
          userId,
          matchExtra: { _id: { $lt: targetId } },
          limit,
          sortOrder: -1, // get newest first
        })
      ),
      MessageModel.aggregate(
        buildMessagePipeline({
          roomId,
          userId,
          matchExtra: { _id: { $gt: targetId } },
          limit,
          sortOrder: 1, // get oldest first
        })
      ),
      MessageModel.aggregate(
        buildMessagePipeline({
          roomId,
          userId,
          matchExtra: { _id: targetId },
          limit: 1,
        })
      ),
    ]);

    const before = beforeRaw.reverse();
    const result = [...before, target, ...after];
    const userIdsToFetch = new Set<string>();

    result.forEach((message: Record<string, any>) => {
      if (message.senderId) {
        userIdsToFetch.add(message.senderId.toString());
      }
    });
    const users = await getUsers([...userIdsToFetch]);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const enrichedMessages = result.map((message: Record<string, any>) => {
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
        centerId: targetId,
        hasOlder: before.length === limit,
        hasNewer: after.length === limit,
      })
    );
  } catch (error) {
    console.log(error);
    return res.status(500).json(rejected("Oops something went wrong."));
  }
};

export const send = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { roomId } = req.params;
    const { content, isForwarded, parentId } = req.body;

    const mentions = await handleMentions(content);
    const newMessage = new MessageModel({
      roomId: new mongoose.Types.ObjectId(roomId),
      content,
      mentions,
      ...(isForwarded ? { isForwarded } : {}),
      ...(parentId ? { parentId } : {}),
      senderId: new mongoose.Types.ObjectId(req.user!._id),
    });
    await newMessage.save({ session });

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

    await handleLastMessageJob({
      roomId: new mongoose.Types.ObjectId(roomId),
      insertedMessageId: newMessage._id as mongoose.Types.ObjectId,
    });

    await processMessageJob({
      messageId: newMessage._id as mongoose.Types.ObjectId,
      roomId: new mongoose.Types.ObjectId(roomId),
      senderId: new mongoose.Types.ObjectId(req.user!._id),
    });
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

const handleMentions = async (message: string) => {
  const mentionRegex = /@([a-zA-Z0-9._-]+)(?=\s|$|[!?,:;])/g;
  let match;
  const mentions = [];

  while ((match = mentionRegex.exec(message)) !== null) {
    const username = match[1];
    const userId = await getUserByUserName(username);

    if (userId) {
      mentions.push({
        userId,
        start: match.index,
        end: match.index + username.length + 1,
      });
    }
  }

  return mentions;
};

export const react = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { messageId } = req.params;
    const { emoji } = req.body;

    const message = await MessageModel.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
    })
      .populate<{ roomId: IRoom }>({ path: "roomId", model: ROOM_MODEL_NAME })
      .lean();
    if (!message) return res.status(404).json(rejected("Message not found."));

    const messageStatus = await MessageStatusModel.findOne({
      messageId: new mongoose.Types.ObjectId(messageId),
      userId: new mongoose.Types.ObjectId(req.user!._id),
    }).lean();
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

      void handleLastMessageJob({
        roomId: message.roomId._id as mongoose.Types.ObjectId,
        deletedMessageId: messageStatus?.reaction?.messageReactionId,
      });
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

      await RoomModel.findOneAndUpdate(
        { _id: message.roomId._id },
        { "stats.lastMessageId": messageDoc._id }
      ).session(session);

      void handleLastMessageJob({
        roomId: message.roomId._id as mongoose.Types.ObjectId,
        insertedMessageId: messageDoc._id as mongoose.Types.ObjectId,
      });

      void processMessageJob({
        messageId: messageDoc._id as mongoose.Types.ObjectId,
        roomId: message.roomId._id as mongoose.Types.ObjectId,
        senderId: new mongoose.Types.ObjectId(req.user!._id),
      });
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

export const pin = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const { messageId } = req.params;

    const message = await MessageModel.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
    }).session(session);
    if (!message) return res.status(404).json(rejected("Message not found."));

    if (message.isPinned) {
      await MessageModel.updateOne(
        { _id: new mongoose.Types.ObjectId(messageId) },
        { $unset: { isPinned: 1 } },
        { session }
      );
    } else {
      await MessageModel.updateOne(
        { _id: new mongoose.Types.ObjectId(messageId) },
        { $set: { isPinned: true } },
        { session }
      );

      const messageDoc = await new MessageModel({
        content: `${req.user?.firstName} ${req.user?.lastName} has pinned a message.`,
        senderId: req.user!._id,
        roomId: message.roomId,
        type: MessageType.SYSTEM,
      }).save({ session });

      await RoomModel.findOneAndUpdate(
        { _id: message.roomId },
        { "stats.lastActivityAt": new Date() }
      ).session(session);

      void handleLastMessageJob({
        roomId: message.roomId,
        insertedMessageId: messageDoc._id as mongoose.Types.ObjectId,
      });

      void processMessageJob({
        messageId: messageDoc._id as mongoose.Types.ObjectId,
        roomId: message.roomId,
        senderId: new mongoose.Types.ObjectId(req.user!._id),
      });
    }
    await session.commitTransaction();
    return res.status(200).json(fulfilled("Operation successful."));
  } catch (error) {
    await session.abortTransaction();
    console.log(error);
    return res.status(500).json(rejected("Reaction could not be sent."));
  } finally {
    await session.endSession();
  }
};

export const pinnedMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const pipeline: PipelineStage[] = [
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user?._id),
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
          "message.isPinned": true,
        },
      },
      {
        $sort: { "message.createdAt": -1 },
      },
      {
        $project: {
          _id: 1,
          content: "$message.content",
          senderId: "$message.senderId",
          type: "$message.type",
          createdAt: "$message.createdAt",
          isPinned: "$message.isPinned",
          status: {
            sentAt: "$sentAt",
            deliveredAt: "$deliveredAt",
            seenAt: "$seenAt",
            starred: "$starred",
          },
        },
      },
    ];
    const messages = await MessageStatusModel.aggregate(pipeline);

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
      })
    );
  } catch (error) {
    console.log(error);
    return res.status(500).json(rejected("Messages could not be fetched."));
  }
};

export const star = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const { messageId } = req.params;

    const message = await MessageModel.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
    }).session(session);
    if (!message) return res.status(404).json(rejected("Message not found."));

    const messageStatus = await MessageStatusModel.findOne({
      messageId: new mongoose.Types.ObjectId(messageId),
      userId: new mongoose.Types.ObjectId(req.user!._id),
      deleted: { $ne: true },
    }).session(session);
    if (!messageStatus)
      return res.status(404).json(rejected("Message not found."));

    await MessageStatusModel.updateOne(
      { _id: messageStatus._id },
      { starred: !messageStatus.starred },
      { session }
    );

    await session.commitTransaction();
    return res.status(200).json(fulfilled("Operation successful."));
  } catch (error) {
    await session.abortTransaction();
    console.log(error);
    return res.status(500).json(rejected("Reaction could not be sent."));
  } finally {
    await session.endSession();
  }
};

export const starredMessages = async (req: AuthRequest, res: Response) => {
  try {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user?._id),
          starred: true,
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
        $sort: { "message.createdAt": -1 },
      },
      {
        $lookup: {
          from: ROOM_COLLECTION_NAME,
          let: { roomId: "$message.roomId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$roomId"] } } },
            { $project: { name: 1, isPrivate: 1 } },
          ],
          as: "room",
        },
      },
      {
        $unwind: "$room",
      },
      {
        $lookup: {
          from: ROOM_MEMBER_COLLECTION_NAME,
          let: {
            roomId: "$room._id",
            myId: "$userId",
            isPrivate: "$room.isPrivate",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$roomId", "$$roomId"] },
                    { $ne: ["$userId", "$$myId"] },
                    { $eq: ["$$isPrivate", true] },
                  ],
                },
              },
            },
            { $project: { userId: 1, _id: 0 } },
          ],
          as: "otherMember",
        },
      },
      {
        $unwind: { path: "$otherMember", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          _id: 1,
          content: "$message.content",
          senderId: "$message.senderId",
          type: "$message.type",
          createdAt: "$message.createdAt",
          isPinned: "$message.isPinned",
          status: {
            sentAt: "$sentAt",
            deliveredAt: "$deliveredAt",
            seenAt: "$seenAt",
            starred: "$starred",
          },
          room: "$room",
          otherMemberId: "$otherMember.userId",
        },
      },
    ];
    const messages = await MessageStatusModel.aggregate(pipeline);

    const userIdsToFetch = new Set<string>();

    messages.forEach((message: Record<string, any>) => {
      if (message.senderId) {
        userIdsToFetch.add(message.senderId.toString());
      }
      if (message.otherMemberId) {
        userIdsToFetch.add(message.otherMemberId.toString());
      }
    });
    const users = await getUsers([...userIdsToFetch]);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const enrichedMessages = messages.map((message: Record<string, any>) => {
      const sender = userMap.get(message.senderId?.toString() || "");
      const otherMember = userMap.get(message.otherMemberId?.toString() || "");

      const { senderId, otherMemberId, ...restMessage } = message;
      return {
        ...restMessage,
        sender,
        otherMember,
      };
    });
    return res.status(200).json(
      fulfilled("Messages fetched successfully.", {
        messages: enrichedMessages,
      })
    );
  } catch (error) {
    console.log(error);
    return res.status(500).json(rejected("Messages could not be fetched."));
  }
};

export const deleteForMe = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { messageIds } = req.body;
    const { roomId } = req.params;
    const messageIdObjects = messageIds.map(
      (messageId: string) => new mongoose.Types.ObjectId(messageId)
    );

    const membership = await RoomMemberModel.findOne({
      userId: new mongoose.Types.ObjectId(req.user!._id),
      roomId: new mongoose.Types.ObjectId(roomId),
    });
    if (!membership) return res.status(404).json(rejected("Room not found."));

    await MessageStatusModel.updateMany(
      {
        userId: new mongoose.Types.ObjectId(req.user!._id),
        messageId: { $in: messageIdObjects },
      },
      { deleted: true },
      { session }
    );

    if (messageIds.includes(membership.lastMessageId?.toString())) {
      const pipeline: PipelineStage[] = [
        {
          $match: {
            userId: new mongoose.Types.ObjectId(req.user!._id),
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
      const [result] = await MessageStatusModel.aggregate(pipeline).session(
        session
      );
      const lastMessageId = result?.message?._id || null;
      await RoomMemberModel.updateOne(
        { _id: membership._id },
        { lastMessageId },
        { session }
      );
    }
    await session.commitTransaction();
    return res.status(200).json(fulfilled("Messages deleted successfully."));
  } catch (error) {
    await session.abortTransaction();
    console.log(error);
    return res.status(500).json(rejected("Messages could not be deleted."));
  } finally {
    await session.endSession();
  }
};

export const deleteForEveryone = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    let { messageIds } = req.body;
    const { roomId } = req.params;
    messageIds = messageIds.map(
      (messageId: string) => new mongoose.Types.ObjectId(messageId)
    );

    await MessageModel.updateMany(
      {
        _id: { $in: messageIds },
        roomId: new mongoose.Types.ObjectId(roomId),
        senderId: new mongoose.Types.ObjectId(req.user!._id),
      },
      {
        content: "This message was deleted.",
        isDeleted: true,
        type: MessageType.SYSTEM,
      },
      { session }
    );
    await session.commitTransaction();
    return res.status(200).json(fulfilled("Messages deleted successfully."));
  } catch (error) {
    await session.abortTransaction();
    console.log(error);
    return res.status(500).json(rejected("Messages could not be deleted."));
  } finally {
    await session.endSession();
  }
};

export const clearChat = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { roomId } = req.params;

    await RoomMemberModel.updateOne(
      {
        roomId: new mongoose.Types.ObjectId(roomId),
        userId: new mongoose.Types.ObjectId(req.user!._id),
      },
      {
        lastMessageId: null,
      },
      { session }
    );

    await clearRoomChatJob({
      roomId: new mongoose.Types.ObjectId(roomId),
      userId: new mongoose.Types.ObjectId(req.user!._id),
    });
    await session.commitTransaction();
    return res.status(200).json(fulfilled("Messages deleted successfully."));
  } catch (error) {
    await session.abortTransaction();
    console.log(error);
    return res.status(500).json(rejected("Messages could not be deleted."));
  } finally {
    await session.endSession();
  }
};
