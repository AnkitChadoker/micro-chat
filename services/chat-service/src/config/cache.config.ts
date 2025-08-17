import { LRUCache } from "lru-cache";

export const cache = new LRUCache<string, any>({
  max: 1000, // Maximum number of items in the cache
  ttl: 1000 * 60 * 5, // Time to live in milliseconds (5 minutes)
});
