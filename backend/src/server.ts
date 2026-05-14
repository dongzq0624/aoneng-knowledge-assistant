// Express 主服务
// ⚠️ 重要：必须在所有其他导入之前加载环境变量
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import fs from "fs/promises";
import uploadRouter from "./routes/upload.js";
import chatRouter from "./routes/chat.js";
import knowledgeRouter from "./routes/knowledge.js";
import { vectorStore } from "./services/vectorstore.js";

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 确保上传目录存在
async function ensureUploadDir() {
  try {
    await fs.access("./uploads");
  } catch {
    await fs.mkdir("./uploads", { recursive: true });
    console.log("✅ 创建上传目录");
  }
}

// 初始化服务
async function initializeServices() {
  console.log("🚀 初始化服务...");

  await ensureUploadDir();
  await vectorStore.initialize();

  console.log("✅ 所有服务初始化完成");
}

// 路由
app.use("/api/upload", uploadRouter);
app.use("/api/chat", chatRouter);
app.use("/api/knowledge", knowledgeRouter);

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Local DeepSeek RAG Backend" });
});

// 启动服务器
async function startServer() {
  try {
    await initializeServices();

    app.listen(PORT, () => {
      console.log(`\n🎉 服务器运行在 http://localhost:${PORT}`);
      console.log(`📊 健康检查: http://localhost:${PORT}/api/health`);
      console.log(`📤 上传接口: http://localhost:${PORT}/api/upload`);
      console.log(`💬 聊天接口: http://localhost:${PORT}/api/chat\n`);
    });
  } catch (error) {
    console.error("❌ 服务器启动失败:", error);
    process.exit(1);
  }
}

startServer();
