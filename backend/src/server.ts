// Express 主服务
// ⚠️ 重要：必须在所有其他导入之前加载环境变量
import dotenv from "dotenv";
dotenv.config();

import { execFile } from "child_process";
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import { promisify } from "util";
import uploadRouter from "./routes/upload.js";
import chatRouter from "./routes/chat.js";
import knowledgeRouter from "./routes/knowledge.js";
import modelRouter from "./routes/model.js";
import { vectorStore } from "./services/vectorstore.js";
import { initializeModels } from "./services/ragChain.js";

const app = express();
const PORT = process.env.PORT || 3001;
const execFileAsync = promisify(execFile);

// 中间件
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// 确保上传目录存在
async function ensureUploadDir() {
  try {
    await fs.access("./uploads");
  } catch {
    await fs.mkdir("./uploads", { recursive: true });
    console.log("✅ 创建上传目录");
  }
}

async function checkDocxPageRenderer() {
  const candidates =
    process.platform === "win32"
      ? [
          "soffice.exe",
          "libreoffice.exe",
          "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
          "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
        ]
      : ["soffice", "libreoffice"];

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"], { timeout: 5000 });
      console.log(`✅ DOCX 真分页渲染可用: ${candidate}`);
      return;
    } catch {
      // Continue checking known LibreOffice executable locations.
    }
  }

  console.warn(
    "⚠️ 未检测到 LibreOffice。DOCX 会降级为高清文本页图 + 内嵌图片理解；如需保留 Word 原始版式分页，请安装 LibreOffice 并确保 soffice 可执行。"
  );
}

// 初始化服务
async function initializeServices() {
  console.log("🚀 初始化服务...");

  await ensureUploadDir();
  await checkDocxPageRenderer();
  await vectorStore.initialize();
  await initializeModels();

  console.log("✅ 所有服务初始化完成");
}

// 路由
app.use("/api/upload", uploadRouter);
app.use("/api/chat", chatRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/model", modelRouter);

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "AONENG Knowledge Assistant Backend" });
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
