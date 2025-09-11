import { Request, Response } from "express";
import * as bcrypt from "bcryptjs";
import UserModel from "../models/user.model";
import { fulfilled, rejected } from "../utils/response.util";
import { AuthRequest } from "../middlewares/auth.middleware";
import { userNameUpdated, userUpdated } from "../services/kafka/user.kafka";

export const me = async (req: AuthRequest, res: Response) => {
  try {
    const profile = req.user;
    res
      .status(200)
      .json(fulfilled("Profile fetched successfully", { profile }));
  } catch (error) {
    res.status(500).json(rejected("Internal server error"));
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, username } = req.body;

    const previousData = await UserModel.findOne({ _id: req.user?.id });
    if (!previousData) throw new Error();

    const profile = await UserModel.findOneAndUpdate(
      { _id: req.user?.id },
      {
        ...(firstName && { firstName }),
        ...(username && { username }),
        ...(lastName && { lastName }),
      },
      { new: true }
    );
    if (!profile) throw new Error();
    await userUpdated(profile);

    if (username && previousData.username !== username) {
      await userNameUpdated(req.user?.id, previousData.username, username);
    }
    res.status(200).json(fulfilled("Profile updated successfully.", profile));
  } catch (error) {
    res.status(500).json(rejected("Profile could not be updated"));
  }
};
