import { NextFunction, Request, Response } from "express";
import { rejected } from "../utils/response.util";

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(err);
  res.status(500).json(rejected("Internal server error", err.message));
};
