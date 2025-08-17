import { authClient } from "./auth.grpc";

function verifyTokenAsync(token: string): Promise<any> {
  return new Promise((resolve) => {
    authClient.VerifyToken({ token }, (err: any, response: any) => {
      if (!response || !response.valid) {
        return resolve(null);
      }
      resolve(response.user);
    });
  });
}

export const authService = {
  verifyToken: verifyTokenAsync,
};
