import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.util";
import { IUser } from "../models/user.model";

export interface AuthRequest extends Request {
  user?: Partial<IUser>;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Missing token" });

  const user = await verifyToken(token);
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  req.user = user;
  next();
};
