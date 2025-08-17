// userCache.ts
import { authService } from "../services/grpc/auth";
import {
  getLRU,
  getMultipleRedis,
  getRedis,
  setLRU,
  setRedis,
} from "./cache.util";

export async function getUser(userId: string) {
  // 1. Try LRU
  let key = `user:${userId}`;
  let user = getLRU(userId);
  if (user) {
    setLRU(userId, user);
    return user;
  }

  // 2. Try Redis
  const cached = await getRedis(`user:${userId}`);
  if (cached) {
    user = JSON.parse(cached);
    setLRU(userId, user);
    await setRedis(key, user);
    return user;
  }

  // 3. Fallback → gRPC call
  user = await authService.userDetail(userId);

  // 4. Save to caches
  setLRU(userId, user);
  await setRedis(`user:${userId}`, user);

  return user;
}

export async function getUsers(userIds: string[]) {
  const results: Record<string, any> = {};
  const missing: string[] = [];

  // 1. Check LRU
  for (const id of userIds) {
    const cached = getLRU(id);
    if (cached) {
      setLRU(id, cached);
      results[id] = cached;
    } else {
      missing.push(id);
    }
  }

  if (missing.length === 0) return userIds.map((id) => results[id]);

  // 2. Check Redis for missing
  const redisKeys = missing.map((id) => `user:${id}`);
  const redisValues = await getMultipleRedis(redisKeys);

  const stillMissing: string[] = [];

  redisValues.forEach((val, idx) => {
    const id = missing[idx];
    let key = `user:${id}`;
    if (val) {
      const user = JSON.parse(val);
      results[id] = user;

      setLRU(id, user);
      setRedis(key, user);
    } else {
      stillMissing.push(id);
    }
  });

  if (stillMissing.length === 0) return userIds.map((id) => results[id]);

  // 3. Fetch from gRPC for still-missing
  const fetchedUsers = await authService.usersDetail(stillMissing);

  for (const user of fetchedUsers) {
    results[user._id] = user;
    setLRU(user._id, user);
    await setRedis(`user:${user._id}`, user);
  }

  return userIds.map((id) => results[id] || null); // keep order
}
