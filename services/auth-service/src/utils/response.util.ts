export interface SuccessResponse<T = any> {
  status: true;
  message: string;
  data?: T;
}

export interface ErrorResponse {
  status: false;
  message: string;
  error?: any;
}

export const fulfilled = <T>(
  message: string,
  data?: T
): SuccessResponse<T> => ({
  status: true,
  message,
  data,
});

export const rejected = (message: string, error?: any): ErrorResponse => ({
  status: false,
  message,
  error,
});
