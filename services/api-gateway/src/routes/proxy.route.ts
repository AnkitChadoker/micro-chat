import express from "express";
import { createProxyMiddleware, Options } from "http-proxy-middleware";
import { services } from "../config";

const router = express.Router();

router.use(
  "/auth",
  createProxyMiddleware({
    target: services.AUTH.url,
    changeOrigin: true,
    pathRewrite: { "^/auth": "" },
    debug: true,
    onProxyReq: (_: any, req: express.Request) => {
      console.log(
        `[Gateway] Forwarding ${req.method} ${req.originalUrl} → ${services.AUTH.url}${req.url}`
      );
    },
    onError: (err: any, _: express.Request, res: express.Response) => {
      console.error(`[Gateway] Error proxying to auth-service:`, err.message);
      res.status(500).json({ message: "Gateway error" });
    },
  } as Options)
);

router.use(
  "/chat",
  createProxyMiddleware({
    target: services.CHAT.url,
    changeOrigin: true,
    pathRewrite: { "^/chat": "" },
    debug: true,
    onProxyReq: (_: any, req: express.Request) => {
      console.log(
        `[Gateway] Forwarding ${req.method} ${req.originalUrl} → ${services.CHAT.url}${req.url}`
      );
    },
    onError: (err: any, _: express.Request, res: express.Response) => {
      console.error(`[Gateway] Error proxying to chat-service:`, err.message);
      res.status(500).json({ message: "Gateway error" });
    },
  } as Options)
);

router.use(
  "/search",
  createProxyMiddleware({
    target: services.SEARCH.url,
    changeOrigin: true,
    pathRewrite: { "^/search": "" },
    debug: true,
    onProxyReq: (_: any, req: express.Request) => {
      console.log(
        `[Gateway] Forwarding ${req.method} ${req.originalUrl} → ${services.SEARCH.url}${req.url}`
      );
    },
    onError: (err: any, _: express.Request, res: express.Response) => {
      console.error(`[Gateway] Error proxying to search-service:`, err.message);
      res.status(500).json({ message: "Gateway error" });
    },
  } as Options)
);

export default router;
