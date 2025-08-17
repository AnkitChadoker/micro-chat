import { ServerUnaryCall, sendUnaryData } from "@grpc/grpc-js";

export interface VerifyTokenRequest {
  token: string;
}

export interface VerifyTokenResponse {
  valid: boolean;
  user: {
    _id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
}

export interface UserDetailRequest {
  _id: string;
}

export interface UserDetailResponse {
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface UsersDetailRequest {
  _ids: string[];
}

export interface UsersDetailResponse {
  users:
    | {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
      }[]
    | [];
}
