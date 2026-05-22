// 聊天路由
import express from "express";
import { ragQuery } from "../services/ragChain.js";
import type { ChatRequest } from "../types.js";

const router = express.Router();

// POST /api/chat - 流式响应
router.post("/", async (req, res) => {
  try {
    const { message, history = [] } = req.body as ChatRequest;

    if (!message) {
      return res.status(400).json({ error: "消息不能为空" });
    }

    console.log(`💬 收到用户消息: ${message.substring(0, 50)}...`);

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // 流式发送回答（sources 信息在 ragQuery 内部随图片一起发送）
    const stream = ragQuery(message, history);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    // 发送结束信号
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (error) {
    console.error("❌ 聊天处理失败:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "处理失败",
      });
    } else {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "处理失败",
        })}\n\n`
      );
      res.end();
    }
  }
});

export default router;
