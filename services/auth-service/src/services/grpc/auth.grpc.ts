import mongoose from "mongoose";
import userModel from "../../models/user.model";
import {
  UserDetailRequest,
  UserDetailResponse,
  UsersDetailRequest,
  UsersDetailResponse,
  VerifyTokenRequest,
  VerifyTokenResponse,
} from "../../types/auth.grpc";
import { verifyToken } from "../../utils/jwt.util";
import { ServerUnaryCall, sendUnaryData } from "@grpc/grpc-js";

export const authHandlers = {
  verifyToken: async (
    call: ServerUnaryCall<VerifyTokenRequest, VerifyTokenResponse>,
    callback: sendUnaryData<VerifyTokenResponse>
  ) => {
    const token = call.request.token;
    const user = await verifyToken(token);

    if (!user) {
      return callback(null, { user: null, valid: false });
    }

    const response = {
      user: {
        _id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
      valid: true,
    };
    callback(null, response);
  },

  userDetail: async (
    call: ServerUnaryCall<UserDetailRequest, UserDetailResponse>,
    callback: sendUnaryData<UserDetailResponse>
  ) => {
    const _id = call.request._id;
    const user = await userModel.findOne({
      _id: new mongoose.Types.ObjectId(_id),
    });

    if (!user) {
      return callback(null);
    }

    const response = {
      user: {
        _id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    };
    callback(null, response);
  },

  usersDetail: async (
    call: ServerUnaryCall<UsersDetailRequest, UsersDetailResponse>,
    callback: sendUnaryData<UsersDetailResponse>
  ) => {
    const _ids = call.request._ids;
    const users = await userModel.find({
      _id: { $in: _ids },
    });

    if (!users || users.length === 0) {
      return callback(null, { users: [] });
    }
    const response: UsersDetailResponse = {
      users: users.map((user) => ({
        _id: user._id as string,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      })),
    };

    callback(null, response);
  },
};
