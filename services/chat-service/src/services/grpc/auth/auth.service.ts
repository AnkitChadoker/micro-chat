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

function userDetailAsync(_id: string): Promise<any> {
  return new Promise((resolve) => {
    authClient.userDetail({ _id }, (err: any, response: any) => {
      if (err || !response) {
        resolve(null);
      } else {
        resolve(response.user);
      }
    });
  });
}

function userDetailByUserNameAsync(username: string): Promise<any> {
  return new Promise((resolve) => {
    authClient.userDetailByUserName({ username }, (err: any, response: any) => {
      if (err || !response) {
        resolve(null);
      } else {
        resolve(response.user);
      }
    });
  });
}

function usersDetailAsync(_ids: string[]): Promise<any[]> {
  return new Promise((resolve) => {
    authClient.usersDetail({ _ids }, (err: any, response: any) => {
      if (err || !response || !response.users) {
        resolve([]);
      } else {
        resolve(response.users);
      }
    });
  });
}

export const authService = {
  userDetail: userDetailAsync,
  userDetailByUserName: userDetailByUserNameAsync,
  verifyToken: verifyTokenAsync,
  usersDetail: usersDetailAsync,
};
