export * from "./service.config";

export const config = {
  env: process.env.NODE_ENV || "development",
  port: process.env.PORT || 3000,
  rateLimit: {
    windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX_REQUESTS || 100, // limit each IP to 100 requests per windowMs
  },
};
