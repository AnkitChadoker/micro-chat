export interface ServiceConfig {
  name: string;
  url: string;
  timeout: number;
}

export const services: Record<string, ServiceConfig> = {
  AUTH: {
    name: "auth-service",
    url: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
    timeout: parseInt(process.env.AUTH_SERVICE_TIMEOUT || "5000"),
  },

  CHAT: {
    name: "chat-service",
    url: process.env.CHAT_SERVICE_URL || "http://localhost:3002",
    timeout: parseInt(process.env.CHAT_SERVICE_TIMEOUT || "5000"),
  },

  SEARCH: {
    name: "search-service",
    url: process.env.SEARCH_SERVICE_URL || "http://localhost:3003",
    timeout: parseInt(process.env.CHAT_SERVICE_TIMEOUT || "5000"),
  },
};
