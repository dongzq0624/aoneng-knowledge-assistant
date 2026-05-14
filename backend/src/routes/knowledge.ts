// 知识库管理路由
import express from "express";
import { vectorStore } from "../services/vectorstore.js";

const router = express.Router();

// GET /api/knowledge - 获取所有文档列表
router.get("/", async (req, res) => {
  try {
    const documents = await vectorStore.getAllDocuments();
    res.json({
      success: true,
      documents,
    });
  } catch (error) {
    console.error("❌ 获取文档列表失败:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "获取失败",
    });
  }
});

// GET /api/knowledge/vectors - 获取所有向量数据详情
router.get("/vectors", async (req, res) => {
  try {
    const vectors = await vectorStore.getAllVectors();
    res.json({
      success: true,
      vectors,
      total: vectors.length,
    });
  } catch (error) {
    console.error("❌ 获取向量数据失败:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "获取失败",
    });
  }
});

// DELETE /api/knowledge - 删除所有文档
router.delete("/", async (req, res) => {
  try {
    console.log("🗑️ 批量删除所有文档");

    const count = await vectorStore.deleteAllDocuments();

    res.json({
      success: true,
      message: `已删除所有文档，共 ${count} 个文档块`,
      count,
    });
  } catch (error) {
    console.error("❌ 批量删除失败:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "删除失败",
    });
  }
});

// DELETE /api/knowledge/:filename - 删除指定文档
router.delete("/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const decodedFilename = decodeURIComponent(filename);

    console.log(`🗑️ 删除文档: ${decodedFilename}`);

    const count = await vectorStore.deleteDocument(decodedFilename);

    res.json({
      success: true,
      message: `已删除 ${count} 个文档块`,
      count,
    });
  } catch (error) {
    console.error("❌ 删除文档失败:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "删除失败",
    });
  }
});

export default router;
