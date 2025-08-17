import jwt from "jsonwebtoken";
import UserModel, { IUser } from "../models/user.model";

export const generateToken = (userId: string): string => {
  return jwt.sign({ _id: userId }, process.env.JWT_SECRET as string, {
    expiresIn: "1h",
  });
};

export const verifyToken = async (
  token: string
): Promise<Partial<IUser> | null> => {
  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    const user = await UserModel.findById(decoded._id);
    if (!user) return null;

    return {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    };
  } catch (error) {
    return null;
  }
};
