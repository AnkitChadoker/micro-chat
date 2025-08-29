import Redis from "ioredis";

export const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6380,
};

export const redis = new Redis(redisConnection);
