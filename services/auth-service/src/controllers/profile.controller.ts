import { Request, Response } from "express";
import * as bcrypt from "bcryptjs";
import UserModel from "../models/user.model";
import { fulfilled, rejected } from "../utils/response.util";
import { AuthRequest } from "../middlewares/auth.middleware";
import { userUpdated } from "../services/kafka/user.kafka";

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
    const { firstName, lastName } = req.body;
    const profile = await UserModel.findOneAndUpdate(
      { _id: req.user?.id },
      { ...(firstName && { firstName }), ...(lastName && { lastName }) },
      { new: true }
    );
    if (!profile) throw new Error();
    await userUpdated(profile);
    res.status(200).json(fulfilled("Profile updated successfully.", profile));
  } catch (error) {
    res.status(500).json(rejected("Profile could not be updated"));
  }
};
