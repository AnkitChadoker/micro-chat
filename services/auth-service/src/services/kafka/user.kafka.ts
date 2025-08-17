import mongoose from "mongoose";
import { IUser } from "../../models/user.model";
import { producer } from "../../config";

export const userCreated = async (user: Partial<IUser>) => {
  await producer.send({
    topic: "users",
    messages: [
      {
        key: "userCreated",
        value: JSON.stringify({
          event: "userCreated",
          data: {
            _id: user._id as string,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
          },
        }),
      },
    ],
  });
};

export const userUpdated = async (user: Partial<IUser>) => {
  await producer.send({
    topic: "users",
    messages: [
      {
        key: "userUpdated",
        value: JSON.stringify({
          event: "userUpdated",
          data: {
            _id: user._id as string,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
          },
        }),
      },
    ],
  });
};

export const userDeleted = async (id: mongoose.Types.ObjectId) => {
  await producer.send({
    topic: "users",
    messages: [
      {
        key: "userDeleted",
        value: JSON.stringify({
          event: "userDeleted",
          data: { _id: id.toString() },
        }),
      },
    ],
  });
};
