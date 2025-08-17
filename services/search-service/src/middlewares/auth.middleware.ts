import { Request, Response, NextFunction } from "express";
import { authService } from "../services/grpc/auth";
import { rejected } from "../utils/response.util";

export interface AuthRequest extends Request {
  user?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json(rejected("Unauthorized!"));
  }

  const user = await authService.verifyToken(token);
  if (!user) {
    return res.status(401).json(rejected("Unauthorized!"));
  }
  req.user = {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };

  next();
};
