import { Request, Response } from "express";
import mongoose, { PipelineStage } from "mongoose";
import RoomModel, { ROOM_COLLECTION_NAME } from "../models/room.model";
import RoomMemberModel, {
  ROOM_MEMBER_COLLECTION_NAME,
} from "../models/room-member.model";
import { fulfilled, rejected } from "../utils/response.util";
import { AuthRequest } from "../middlewares/auth.middleware";
import { getUser, getUsers } from "../utils/user.util";
import MessageModel, {
  MESSAGE_COLLECTION_NAME,
  MessageType,
} from "../models/message.model";
import MessageStatusModel from "../models/message-status.model";

export const list = async (req: AuthRequest, res: Response) => {
  try {
    const { limit, page, search } = req.body;

    const pipeline: PipelineStage[] = [
      {
        $match: { userId: new mongoose.Types.ObjectId(req.user!._id) },
      },
      {
        $lookup: {
          from: ROOM_COLLECTION_NAME,
          localField: "roomId",
          foreignField: "_id",
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
            roomId: "$roomId",
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
        $lookup: {
          from: MESSAGE_COLLECTION_NAME,
          localField: "room.stats.lastMessageId",
          foreignField: "_id",
          as: "lastMessage",
        },
      },
      {
        $unwind: {
          path: "$lastMessage",
          preserveNullAndEmptyArrays: true, // in case no message exists
        },
      },
      {
        $project: {
          roomId: "$room._id",
          isPrivate: "$room.isPrivate",
          isAdmin: 1,
          joinedAt: 1,
          lastMessage: {
            _id: "$lastMessage._id",
            content: "$lastMessage.content",
            type: "$lastMessage.type",
            senderId: "$lastMessage.senderId",
            createdAt: "$lastMessage.createdAt",
          },
          // Group room fields
          name: {
            $cond: {
              if: { $eq: ["$room.isPrivate", false] },
              then: "$room.name",
              else: null,
            },
          },
          description: {
            $cond: {
              if: { $eq: ["$room.isPrivate", false] },
              then: "$room.description",
              else: null,
            },
          },
          otherMemberId: {
            $cond: {
              if: { $eq: ["$room.isPrivate", true] },
              then: "$otherMember.userId",
              else: null,
            },
          },
        },
      },
      {
        $sort: {
          "stats.lastActivityAt": -1,
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
    const result = await RoomMemberModel.aggregate(pipeline);
    const rooms = result[0]?.data || [];
    const total = result[0]?.metadata[0]?.total || 0;

    const userIdsToFetch = new Set<string>();

    rooms.forEach((room: Record<string, any>) => {
      if (room.isPrivate && room.otherMemberId) {
        userIdsToFetch.add(room.otherMemberId.toString());
      }
      if (room.lastMessage?.senderId) {
        userIdsToFetch.add(room.lastMessage.senderId.toString());
      }
    });

    const users = await getUsers([...userIdsToFetch]);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const enrichedRooms = rooms.map((room: Record<string, any>) => {
      const senderUser = userMap.get(
        room.lastMessage?.senderId?.toString() || ""
      );
      const otherUser = room.isPrivate
        ? userMap.get(room.otherMemberId?.toString() || "")
        : null;

      const { senderId, ...restLastMessage } = room.lastMessage || {};
      const { otherMemberId, ...restRoom } = room;
      return {
        ...restRoom,
        lastMessage: { ...restLastMessage, sender: senderUser },
        otherMember: otherUser,
      };
    });
    return res.status(200).json(
      fulfilled("Rooms fetched successfully.", {
        rooms: enrichedRooms,
        total,
      })
    );
  } catch (error) {
    res.status(500).json(rejected("Could not fetch the groups."));
  }
};

export const createPrivate = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId } = req.body;
    const user = await getUser(userId);
    if (!user) return res.status(404).json(rejected("User not found."));

    const otherUserId = new mongoose.Types.ObjectId(userId);
    const ownerId = new mongoose.Types.ObjectId(req.user!._id);

    let roomId: mongoose.Types.ObjectId;

    // 1. Try to find an existing private room with both members
    const existingRoomPipeline: PipelineStage[] = [
      { $match: { isPrivate: true } },
      {
        $lookup: {
          from: ROOM_MEMBER_COLLECTION_NAME,
          localField: "_id",
          foreignField: "roomId",
          as: "members",
        },
      },
      {
        $addFields: {
          memberIds: "$members.userId",
        },
      },
      {
        $match: {
          $expr: {
            $and: [
              { $eq: [{ $size: "$memberIds" }, 2] },
              {
                $setIsSubset: [[ownerId, otherUserId], "$memberIds"],
              },
            ],
          },
        },
      },
      { $limit: 1 },
    ];
    const [existingRoom] = await RoomModel.aggregate(existingRoomPipeline);

    // 2. If not found, check for unfilled pending room
    if (!existingRoom) {
      const [pendingRoom] = await RoomModel.aggregate([
        {
          $match: {
            isPrivate: true,
            $or: [
              { pendingMemberId: ownerId },
              { pendingMemberId: otherUserId },
            ],
          },
        },
        {
          $lookup: {
            from: ROOM_MEMBER_COLLECTION_NAME,
            localField: "_id",
            foreignField: "roomId",
            as: "members",
          },
        },
        {
          $addFields: {
            memberIds: "$members.userId",
          },
        },
        {
          $match: {
            $expr: {
              $and: [
                { $eq: [{ $size: "$memberIds" }, 1] },
                {
                  $or: [
                    { $in: [ownerId, "$memberIds"] },
                    { $in: [otherUserId, "$memberIds"] },
                  ],
                },
              ],
            },
          },
        },
        { $limit: 1 },
      ]);

      if (pendingRoom) {
        roomId = pendingRoom._id as mongoose.Types.ObjectId;

        if (
          pendingRoom.pendingMemberId?.toString() === otherUserId.toString()
        ) {
          await RoomMemberModel.create(
            {
              roomId,
              userId: otherUserId,
            },
            { session }
          );
        }

        if (pendingRoom.pendingMemberId?.toString() === ownerId.toString()) {
          await RoomMemberModel.create(
            {
              roomId,
              userId: ownerId,
            },
            { session }
          );
        }
        await RoomModel.updateOne(
          { _id: roomId },
          { pendingMemberId: null },
          { session }
        );
      } else {
        // 3. Create a new private room
        const newRoom = new RoomModel({
          isPrivate: true,
          ownerId,
        });

        await newRoom.save({ session });

        roomId = newRoom._id as mongoose.Types.ObjectId;

        await RoomMemberModel.insertMany(
          [
            {
              roomId,
              userId: ownerId,
            },
            {
              roomId,
              userId: otherUserId,
            },
          ],
          { session }
        );
      }
    } else {
      roomId = existingRoom._id as mongoose.Types.ObjectId;
    }

    // 4. Populate the final room
    const populatedRoomPipeline: PipelineStage[] = [
      { $match: { _id: roomId } },
      {
        $lookup: {
          from: ROOM_MEMBER_COLLECTION_NAME,
          let: { roomId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$roomId", "$$roomId"] },
              },
            },
            {
              $project: {
                userId: 1,
                isAdmin: "$isAdmin",
              },
            },
          ],
          as: "members",
        },
      },
    ];

    const [populatedRoom] = await RoomModel.aggregate(
      populatedRoomPipeline
    ).session(session);
    const userIds = populatedRoom.members.map((m: any) => m.userId.toString());
    const users = await getUsers(userIds);

    const enrichedMembers = populatedRoom.members.map((member: any) => {
      const user = users.find((u) => u._id === member.userId.toString());
      const { _id, ...userWithoutId } = user || {};
      return {
        ...member,
        ...userWithoutId,
      };
    });

    populatedRoom.members = enrichedMembers;
    await session.commitTransaction();
    res.status(200).json(
      fulfilled("Room created successfully.", {
        room: populatedRoom,
      })
    );
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json(rejected("Failed to create private room.", error));
  } finally {
    await session.endSession();
  }
};

export const createGroup = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userIds, name, description, onlyAdminCanSendMessage } = req.body;
    const ownerId = req.user!._id;

    const room = await new RoomModel({
      name,
      description,
      isPrivate: false,
      ownerId,
      ...(onlyAdminCanSendMessage && {
        onlyAdminCanSendMessage:
          onlyAdminCanSendMessage === "true" ? true : false,
      }),
    }).save({ session });

    const message = await new MessageModel({
      content: "created",
      senderId: ownerId,
      roomId: room._id,
      type: MessageType.SYSTEM,
    }).save({ session });

    const userObjectIds = userIds.split(",");
    const uniqueUserIds = Array.from(
      new Set([ownerId.toString(), ...userObjectIds.map(String)])
    );

    const roomMembers = uniqueUserIds.map((id) => ({
      roomId: room._id,
      userId: id,
      isAdmin: id === ownerId.toString() ? true : false,
    }));
    await RoomMemberModel.insertMany(roomMembers, { session });

    const messageStatusEntries = uniqueUserIds.map((id) => ({
      messageId: message._id,
      userId: id,
      sentAt: id === ownerId.toString() ? new Date() : undefined,
      deliveredAt: id === ownerId.toString() ? new Date() : undefined,
      seenAt: id === ownerId.toString() ? new Date() : undefined,
    }));
    await MessageStatusModel.insertMany(messageStatusEntries, { session });

    room.stats!.lastActivityAt = new Date();
    room.stats!.totalMembers = roomMembers.length;
    room.stats!.lastActedUserId = ownerId;
    room.stats!.lastMessageId = message._id as mongoose.Types.ObjectId;
    await room.save({ session });

    const populatedRoomPipeline: PipelineStage[] = [
      { $match: { _id: room._id } },
      {
        $lookup: {
          from: MESSAGE_COLLECTION_NAME,
          localField: "stats.lastMessageId",
          foreignField: "_id",
          as: "lastMessage",
        },
      },
      { $unwind: { path: "$lastMessage", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: ROOM_MEMBER_COLLECTION_NAME,
          let: { roomId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$roomId", "$$roomId"] } } },
            {
              $project: {
                userId: 1,
                role: "$role",
              },
            },
          ],
          as: "members",
        },
      },
    ];
    const [populatedRoom] = await RoomModel.aggregate(
      populatedRoomPipeline
    ).session(session);

    const memberIds = populatedRoom.members.map((m: any) =>
      m.userId.toString()
    );

    const users = await getUsers(memberIds);

    const enrichedMembers = populatedRoom.members.map((member: any) => {
      const user = users.find((u) => u._id === member.userId.toString());
      const { _id, ...userWithoutId } = user || {};
      return {
        ...member,
        ...userWithoutId,
      };
    });
    populatedRoom.members = enrichedMembers;

    if (populatedRoom.stats.lastActedUserId) {
      populatedRoom.lastAuthor = await getUser(
        populatedRoom.stats.lastActedUserId
      );
    }
    await session.commitTransaction();
    return res
      .status(200)
      .json(fulfilled("Group created successfully.", { room: populatedRoom }));
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json(rejected("Failed to create group."));
  } finally {
    await session.endSession();
  }
};

export const updateGroup = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { name, description, onlyAdminCanSendMessage } = req.body;
    const { id } = req.params;
    const ownerId = req.user!._id;

    const room = await RoomModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
    });
    if (!room) return res.status(404).json(rejected("Group not found."));

    await RoomModel.findOneAndUpdate(
      { _id: id },
      {
        ...(name && { name }),
        ...(description && { description }),
        ...(onlyAdminCanSendMessage && {
          onlyAdminCanSendMessage:
            onlyAdminCanSendMessage === "true" ? true : false,
        }),
      },
      { session }
    );

    if (name && room.name !== name) {
      const message = await new MessageModel({
        content: `Group name has been changed from "${room.name}" to "${name}"`,
        senderId: ownerId,
        roomId: room._id,
        type: MessageType.SYSTEM,
      }).save({ session });

      const roomMembers = await RoomMemberModel.find({ roomId: room._id });
      const messageStatusEntries = roomMembers.map((member) => ({
        messageId: message._id,
        userId: member.userId,
        sentAt:
          member.userId.toString() === ownerId.toString()
            ? new Date()
            : undefined,
        deliveredAt:
          member.userId.toString() === ownerId.toString()
            ? new Date()
            : undefined,
        seenAt:
          member.userId.toString() === ownerId.toString()
            ? new Date()
            : undefined,
      }));
      await MessageStatusModel.insertMany(messageStatusEntries, { session });

      room.stats!.lastActivityAt = new Date();
      room.stats!.totalMembers = roomMembers.length;
      room.stats!.lastActedUserId = ownerId;
      room.stats!.lastMessageId = message._id as mongoose.Types.ObjectId;
      await room.save({ session });
    }

    if (
      onlyAdminCanSendMessage &&
      onlyAdminCanSendMessage !== room.onlyAdminCanSendMessages &&
      onlyAdminCanSendMessage === "true"
    ) {
      const message = await new MessageModel({
        content: `Group setting has been changed and now only admins can send messages.`,
        senderId: ownerId,
        roomId: room._id,
        type: MessageType.SYSTEM,
      }).save({ session });

      const roomMembers = await RoomMemberModel.find({ roomId: room._id });
      const messageStatusEntries = roomMembers.map((member) => ({
        messageId: message._id,
        userId: member.userId,
        sentAt:
          member.userId.toString() === ownerId.toString()
            ? new Date()
            : undefined,
        deliveredAt:
          member.userId.toString() === ownerId.toString()
            ? new Date()
            : undefined,
        seenAt:
          member.userId.toString() === ownerId.toString()
            ? new Date()
            : undefined,
      }));
      await MessageStatusModel.insertMany(messageStatusEntries, { session });

      room.stats!.lastActivityAt = new Date();
      room.stats!.totalMembers = roomMembers.length;
      room.stats!.lastActedUserId = ownerId;
      room.stats!.lastMessageId = message._id as mongoose.Types.ObjectId;
      await room.save({ session });
    }
    await session.commitTransaction();
    res.status(200).json(fulfilled("Group has been updated successfully."));
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json(rejected("Group could not be updated."));
  } finally {
    await session.endSession();
  }
};

export const members = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pipeline: PipelineStage[] = [
      {
        $match: { roomId: new mongoose.Types.ObjectId(id) },
      },
      {
        $project: {
          userId: 1,
          isAdmin: 1,
          memberSince: "$createdAt",
        },
      },
    ];
    const members = await RoomMemberModel.aggregate(pipeline);

    const memberIds = members.map((member: any) => member.userId.toString());
    const users = await getUsers(memberIds);

    const enrichedMembers = members.map((member: any) => {
      const user = users.find((u) => u._id === member.userId.toString());
      const { _id, ...userWithoutId } = user || {};
      return {
        ...member,
        ...userWithoutId,
      };
    });
    return res.status(200).json(
      fulfilled("Group members fetched successfully.", {
        members: enrichedMembers,
      })
    );
  } catch (error) {
    console.log(error);
    return res.status(500).json(rejected("Members could not be fetched"));
  }
};
