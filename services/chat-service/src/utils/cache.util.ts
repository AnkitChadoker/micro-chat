import { cache, redis } from "../config";

const LRU_TTL = 5 * 60 * 1000; // 5 minutes (ms)
const REDIS_TTL = 24 * 60 * 60;

export const getLRU = (key: string) => {
  return cache.get(key);
};

export const setLRU = (key: string, value: any) => {
  cache.set(key, value, { ttl: LRU_TTL });
};

export function deleteLRU(key: string) {
  cache.delete(key);
}

export const getRedis = async (key: string) => {
  const data = await redis.get(key);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

export const getMultipleRedis = async (keys: string[]) => {
  return await redis.mget(keys);
};

export const setRedis = async (key: string, value: any) => {
  await redis.setex(key, REDIS_TTL, JSON.stringify(value));
};

export const deleteRedis = async (key: string) => {
  await redis.del(key);
};
