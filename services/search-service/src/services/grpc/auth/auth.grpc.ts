import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

const PROTO_PATH = path.resolve(
  __dirname,
  "../../../../../../proto/auth.proto"
);

const packageDef = protoLoader.loadSync(PROTO_PATH);
const proto = grpc.loadPackageDefinition(packageDef) as any;

export const authClient = new proto.auth.AuthService(
  "localhost:50051",
  grpc.credentials.createInsecure()
);
