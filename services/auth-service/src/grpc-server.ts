import path from "path";
import * as grpc from "@grpc/grpc-js";
import {
  GrpcObject,
  ServiceClientConstructor,
  ServiceDefinition,
} from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { authHandlers } from "./services/grpc/auth.grpc";

interface AuthProtoGrpcType extends GrpcObject {
  auth: {
    AuthService: ServiceClientConstructor & {
      service: ServiceDefinition;
    };
  };
}

// 2. Load proto with types
const PROTO_PATH = path.join(__dirname, "../../../proto/auth.proto");
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const grpcObject = grpc.loadPackageDefinition(
  packageDef
) as unknown as AuthProtoGrpcType;
const authPackage = grpcObject.auth;

// 3. Start server with type-safe service
export function startGrpcServer() {
  const server = new grpc.Server();

  server.addService(authPackage.AuthService.service, {
    verifyToken: authHandlers.verifyToken,
    userDetail: authHandlers.userDetail,
    userDetailByUserName: authHandlers.userDetailByUserName,
    usersDetail: authHandlers.usersDetail,
  });

  server.bindAsync(
    `${process.env.AUTH_GRPC_HOST}:${process.env.AUTH_GRPC_PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err: Error | null, port: number) => {
      if (err) {
        console.error("Failed to start gRPC server:", err);
        process.exit(1);
      }
      console.log(
        `gRPC server running at ${process.env.AUTH_GRPC_HOST}:${process.env.AUTH_GRPC_PORT}`
      );
    }
  );
}
