// LanceDB 向量存储服务
import dotenv from "dotenv";
dotenv.config(); // 确保环境变量已加载

import { connect } from "vectordb";
import type { Connection, Table } from "vectordb";
import type { DocumentChunk } from "../types.js";

const GLM_API_KEY =
  process.env.GLM_API_KEY ||
  "a2b3968e02a440c2971691fa545a05d4.TD0pU9hvf17syzly";
const GLM_BASE_URL =
  process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const EMBEDDING_MODEL = process.env.GLM_EMBEDDING_MODEL || "embedding-3";
const DB_PATH = "./lancedb";
const TABLE_NAME = "documents";

class VectorStoreService {
  private db: Connection | null = null;
  private table: Table | null = null;

  constructor() {
    console.log("🔑 使用智谱嵌入模型:", EMBEDDING_MODEL);
  }

  /**
   * 直接调用智谱 Embedding API
   *
   * ⚠️ 重要说明：不使用 LangChain 的 OpenAIEmbeddings
   *
   * 问题原因：
   * LangChain 的 @langchain/openai 包中的 OpenAIEmbeddings 类与智谱 API 不完全兼容。
   * 虽然智谱提供了 OpenAI 兼容的接口，但 LangChain 的实现会导致返回的 embedding 向量全为 0。
   *
   * 影响：
   * - 所有文档的向量都是零向量
   * - 导致相似度计算失效（所有文档相似度都是 1.000）
   * - 检索功能完全失效，无法区分文档相关性
   *
   * 解决方案：
   * 直接使用 fetch 调用智谱的 Embedding API，绕过 LangChain 的封装。
   * 智谱 embedding-3 模型返回 2048 维的向量，可以正常工作。
   *
   * @param text 需要生成 embedding 的文本
   * @returns 2048 维的 embedding 向量
   */
  private async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${GLM_BASE_URL}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `❌ Embedding API 错误: ${response.status} ${response.statusText}`
        );
        console.error(`错误详情: ${errorText}`);
        throw new Error(`Embedding API 调用失败: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error("❌ Embedding 生成失败:", error);
      throw error;
    }
  }

  // 初始化数据库连接
  async initialize(): Promise<void> {
    if (this.db) return;

    try {
      this.db = await connect(DB_PATH);
      console.log("✅ LanceDB 连接成功");

      // 检查表是否存在
      const tableNames = await this.db.tableNames();

      if (tableNames.includes(TABLE_NAME)) {
        this.table = await this.db.openTable(TABLE_NAME);
        console.log("✅ 打开现有表:", TABLE_NAME);
      } else {
        // 延迟创建表，等到第一次添加文档时再创建
        console.log("⏳ 表不存在，将在首次添加文档时创建");
      }
    } catch (error) {
      console.error("❌ LanceDB 初始化失败:", error);
      throw error;
    }
  }

  // 添加文档到向量库
  async addDocuments(chunks: DocumentChunk[]): Promise<number> {
    await this.initialize();

    try {
      const records = await Promise.all(
        chunks.map(async (chunk) => ({
          vector: await this.getEmbedding(chunk.pageContent),
          text: chunk.pageContent,
          source: chunk.metadata.source,
          filename: chunk.metadata.filename,
          chunkIndex: chunk.metadata.chunkIndex,
        }))
      );

      // 如果表不存在，创建新表
      if (!this.table) {
        this.table = await this.db!.createTable(TABLE_NAME, records);
        console.log("✅ 创建新表:", TABLE_NAME);
      } else {
        await this.table.add(records);
      }

      console.log(`✅ 添加 ${records.length} 个文档块到向量库`);
      return records.length;
    } catch (error) {
      console.error("❌ 添加文档失败:", error);
      throw error;
    }
  }

  // 相似度搜索
  async similaritySearch(
    query: string,
    topK: number = 6,
    minScore: number = 0.5 // 最小相似度阈值（0-1，越高越严格）
  ): Promise<DocumentChunk[]> {
    await this.initialize();
    if (!this.table) {
      console.log("⚠️ 向量库为空，请先上传文档");
      return [];
    }

    try {
      const queryVector = await this.getEmbedding(query);
      const results = await this.table
        .search(queryVector)
        .limit(topK * 2) // 多检索一些，然后过滤
        .execute();

      // 过滤并记录相似度分数
      const filteredResults = results
        .filter((r: any) => r.filename !== "init") // 过滤初始化数据
        .map((result: any) => ({
          pageContent: result.text,
          metadata: {
            source: result.source,
            filename: result.filename,
            chunkIndex: result.chunkIndex,
          },
          score: result._distance, // 距离越小越相似
        }))
        .filter((r: any) => {
          // LanceDB 返回的是距离（越小越相似），需要转换为相似度
          // 这里使用简单的阈值过滤
          const similarity = 1 / (1 + r.score); // 转换为 0-1 的相似度
          const isRelevant = similarity >= minScore;

          if (!isRelevant) {
            console.log(
              `⚠️ 过滤低相关文档: ${
                r.metadata.filename
              } (相似度: ${similarity.toFixed(3)})`
            );
          } else {
            console.log(
              `✓ 相关文档: ${r.metadata.filename} (相似度: ${similarity.toFixed(
                3
              )})`
            );
          }

          return isRelevant;
        })
        .slice(0, topK); // 只返回 topK 个

      return filteredResults;
    } catch (error) {
      console.error("❌ 相似度搜索失败:", error);
      throw error;
    }
  }

  // 获取所有文档块（用于关键词检索）
  async getAllDocumentChunks(): Promise<DocumentChunk[]> {
    await this.initialize();
    if (!this.table) {
      return [];
    }

    try {
      const queryVector = await this.getEmbedding("获取所有文档");
      const results = await this.table
        .search(queryVector)
        .limit(10000)
        .execute();

      return results
        .filter((r: any) => r.filename && r.filename !== "init")
        .map((r: any) => ({
          pageContent: r.text,
          metadata: {
            source: r.source,
            filename: r.filename,
            chunkIndex: r.chunkIndex,
          },
        }));
    } catch (error) {
      console.error("❌ 获取所有文档块失败:", error);
      return [];
    }
  }

  // 获取所有向量数据详情
  async getAllVectors(): Promise<
    Array<{
      filename: string;
      chunkIndex: number;
      text: string;
      vectorDimension: number;
    }>
  > {
    await this.initialize();
    if (!this.table) {
      return [];
    }

    try {
      const queryVector = await this.getEmbedding("获取所有文档");
      const results = await this.table
        .search(queryVector)
        .limit(10000)
        .execute();

      return results
        .filter((r: any) => r.filename && r.filename !== "init")
        .map((r: any) => ({
          filename: r.filename,
          chunkIndex: r.chunkIndex,
          text: r.text,
          vectorDimension: r.vector ? r.vector.length : 0,
        }));
    } catch (error) {
      console.error("❌ 获取向量数据失败:", error);
      return [];
    }
  }

  // 获取所有文档列表
  async getAllDocuments(): Promise<
    Array<{ filename: string; chunks: number; uploadTime?: string }>
  > {
    await this.initialize();
    if (!this.table) {
      return [];
    }

    try {
      // 使用一个有效的查询向量获取所有记录
      const queryVector = await this.getEmbedding("获取所有文档");
      const results = await this.table
        .search(queryVector)
        .limit(10000)
        .execute();

      // 按文件名分组统计
      const fileMap = new Map<string, number>();
      results.forEach((r: any) => {
        if (r.filename && r.filename !== "init") {
          fileMap.set(r.filename, (fileMap.get(r.filename) || 0) + 1);
        }
      });

      // 转换为数组
      return Array.from(fileMap.entries()).map(([filename, chunks]) => ({
        filename,
        chunks,
      }));
    } catch (error) {
      console.error("❌ 获取文档列表失败:", error);
      throw error;
    }
  }

  // 删除所有文档（重置数据库）
  async deleteAllDocuments(): Promise<number> {
    await this.initialize();
    if (!this.table) {
      console.log("⚠️ 向量库为空，无需删除");
      return 0;
    }

    try {
      console.log("🔍 开始删除所有文档");

      // 获取所有记录
      const queryVector = await this.getEmbedding("获取所有文档");
      const allResults = await this.table
        .search(queryVector)
        .limit(10000)
        .execute();

      const totalCount = allResults.length;
      console.log(`📊 将删除所有 ${totalCount} 条记录`);

      // 关闭当前连接
      this.table = null;
      this.db = null;

      // 删除整个数据库目录
      const fs = await import("fs/promises");
      try {
        await fs.rm(DB_PATH, { recursive: true, force: true });
        console.log("✅ 已删除旧数据库");
      } catch (e) {
        console.log("⚠️ 删除数据库目录失败，继续...");
      }

      // 重新初始化数据库
      this.db = await connect(DB_PATH);

      // 创建一个初始化记录
      const initData = [
        {
          vector: await this.getEmbedding("初始化"),
          text: "初始化文档",
          source: "system",
          filename: "init",
          chunkIndex: 0,
        },
      ];
      this.table = await this.db.createTable(TABLE_NAME, initData);
      console.log("✅ 已重置数据库");

      return totalCount;
    } catch (error) {
      console.error("❌ 删除所有文档失败:", error);
      // 重新初始化以恢复连接
      this.db = null;
      this.table = null;
      await this.initialize();
      throw error;
    }
  }

  // 删除指定文档（通过重建数据库）
  async deleteDocument(filename: string): Promise<number> {
    await this.initialize();
    if (!this.table) {
      console.log("⚠️ 向量库为空，无需删除");
      return 0;
    }

    try {
      console.log(`🔍 开始删除文档: ${filename}`);

      // 获取所有记录
      const queryVector = await this.getEmbedding("获取所有文档");
      const allResults = await this.table
        .search(queryVector)
        .limit(10000)
        .execute();

      console.log(`📊 当前总记录数: ${allResults.length}`);

      // 过滤掉要删除的文档，只保留需要的字段
      const remainingRecords = allResults
        .filter((r: any) => r.filename !== filename)
        .map((r: any) => ({
          vector: r.vector,
          text: r.text,
          source: r.source,
          filename: r.filename,
          chunkIndex: r.chunkIndex,
        }));

      const deletedCount = allResults.length - remainingRecords.length;
      console.log(`🗑️ 将删除 ${deletedCount} 条记录`);

      if (deletedCount > 0) {
        // 关闭当前连接
        this.table = null;
        this.db = null;

        // 删除整个数据库目录
        const fs = await import("fs/promises");
        try {
          await fs.rm(DB_PATH, { recursive: true, force: true });
          console.log("✅ 已删除旧数据库");
        } catch (e) {
          console.log("⚠️ 删除数据库目录失败，继续...");
        }

        // 重新初始化数据库
        this.db = await connect(DB_PATH);

        // 重新创建表
        if (remainingRecords.length > 0) {
          this.table = await this.db.createTable(TABLE_NAME, remainingRecords);
          console.log(`✅ 重建表，保留 ${remainingRecords.length} 条记录`);
        } else {
          // 如果没有剩余记录，创建一个初始化记录
          const initData = [
            {
              vector: await this.getEmbedding("初始化"),
              text: "初始化文档",
              source: "system",
              filename: "init",
              chunkIndex: 0,
            },
          ];
          this.table = await this.db.createTable(TABLE_NAME, initData);
          console.log("✅ 创建新的初始化表");
        }

        console.log(`✅ 已删除文档 ${filename}，共 ${deletedCount} 个块`);
      } else {
        console.log(`⚠️ 未找到文档 ${filename}`);
      }

      return deletedCount;
    } catch (error) {
      console.error("❌ 删除文档失败:", error);
      // 重新初始化以恢复连接
      this.db = null;
      this.table = null;
      await this.initialize();
      throw error;
    }
  }
}

// 单例导出
export const vectorStore = new VectorStoreService();
