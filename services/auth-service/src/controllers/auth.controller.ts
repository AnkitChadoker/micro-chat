import { Request, Response } from "express";
import * as bcrypt from "bcryptjs";
import UserModel from "../models/user.model";
import { generateToken } from "../utils/jwt.util";
import { fulfilled, rejected } from "../utils/response.util";

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await UserModel.findOne({ email });
    if (!user) return res.status(401).json(rejected("Invalid credentials"));

    if (!(await bcrypt.compare(password as string, user.password))) {
      return res.status(401).json(rejected("Invalid credentials"));
    }
    const token = generateToken(user._id as string);
    res.status(200).json(fulfilled("Login successful", { user, token }));
  } catch (error) {
    res.status(500).json(rejected("Internal server error"));
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    const exists = await UserModel.findOne({ email });
    if (exists) {
      return res
        .status(400)
        .json(rejected("The provided email is already in use."));
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const user = new UserModel({
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });
    user.save();
    res.status(200).json(fulfilled("Registration successful.", user));
  } catch (error) {
    res.status(500).json(rejected("Internal server error"));
  }
};
