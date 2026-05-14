// 文件上传路由
import express from "express";
import multer from "multer";
import path from "path";
import { ingestFile } from "../services/ingest.js";
import type { UploadResponse } from "../types.js";

const router = express.Router();

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// 文件过滤器
const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedExts = [".pdf", ".txt", ".md", ".docx"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`不支持的文件类型: ${ext}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// POST /api/upload
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "未上传文件",
      } as UploadResponse);
    }

    const { path: filePath, originalname } = req.file;

    // 修复中文文件名编码问题
    const decodedFilename = Buffer.from(originalname, "latin1").toString(
      "utf8"
    );

    console.log(`📤 收到文件上传: ${decodedFilename}`);

    // 处理文件并添加到向量库
    const chunks = await ingestFile(filePath, decodedFilename);

    res.json({
      success: true,
      message: "文件上传并处理成功",
      filename: decodedFilename,
      chunks,
    } as UploadResponse);
  } catch (error) {
    console.error("❌ 上传处理失败:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "文件处理失败",
    } as UploadResponse);
  }
});

export default router;
