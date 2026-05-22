// LanceDB 向量存储服务
import dotenv from "dotenv";
dotenv.config();

import { connect } from "vectordb";
import type { Connection, Table } from "vectordb";
import type { DocumentChunk } from "../types.js";
import fs from "fs/promises";
import path from "path";

const DB_PATH = "./lancedb";
const TABLE_NAME = "documents";

interface EmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: "glm" | "deepseek" | "qwen";
}

interface StoredRecord {
  text: string;
  imageContent: string;
  source: string;
  filename: string;
  chunkIndex: number;
  type: "text" | "image" | "page";
}

interface VectorizedRecord extends StoredRecord {
  vector: number[];
}

const INIT_FILENAME = "init";
const QWEN_DEFAULT_EMBEDDING_MODEL = "text-embedding-v4";

function normalizeEmbeddingModel(
  provider: EmbeddingConfig["provider"],
  model?: string
): string {
  if (provider === "qwen") {
    return model === QWEN_DEFAULT_EMBEDDING_MODEL
      ? model
      : QWEN_DEFAULT_EMBEDDING_MODEL;
  }

  if (provider === "deepseek") {
    return model || "deepseek-text-embedding-v1";
  }

  return model || "embedding-3";
}

async function loadEmbeddingConfig(): Promise<EmbeddingConfig> {
  const CONFIG_FILE = path.join(process.cwd(), "model-config.json");
  
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(data);
    const provider = config.provider || "glm";
    
    if (provider === "qwen") {
      const normalizedModel = normalizeEmbeddingModel(
        "qwen",
        config.embeddingModel
      );
      if (normalizedModel !== config.embeddingModel && config.embeddingModel) {
        console.warn(
          `[vectorstore] Qwen embedding model "${config.embeddingModel}" is not supported in compatibility mode, fallback to "${normalizedModel}".`
        );
      }

      return {
        apiKey: config.qwenApiKey || process.env.QWEN_API_KEY || "",
        baseUrl:
          config.qwenBaseUrl ||
          "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: normalizedModel,
        provider: "qwen",
      };
    }
    
    if (provider === "deepseek") {
      return {
        apiKey: config.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "",
        baseUrl: config.deepseekBaseUrl || "https://api.deepseek.com/v1",
        model: normalizeEmbeddingModel("deepseek", config.embeddingModel),
        provider: "deepseek",
      };
    }
    
    return {
      apiKey: config.glmApiKey || process.env.GLM_API_KEY || "",
      baseUrl: config.glmBaseUrl || "https://open.bigmodel.cn/api/paas/v4",
      model: normalizeEmbeddingModel("glm", config.embeddingModel),
      provider: "glm",
    };
  } catch {
    const qwenApiKey = process.env.QWEN_API_KEY || "";
    return {
      apiKey: qwenApiKey,
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: QWEN_DEFAULT_EMBEDDING_MODEL,
      provider: "qwen",
    };
  }
}

function getEmbeddingUrl(config: EmbeddingConfig): string {
  return `${config.baseUrl}/embeddings`;
}

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRateLimit =
        error?.message?.includes("429") ||
        error?.message?.includes("Too Many Requests") ||
        error?.message?.includes("Throttling");

      if (isRateLimit && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        console.log(`⏳ 速率限制，等待 ${(delay / 1000).toFixed(1)}s 后重试 (${attempt + 1}/${maxRetries})...`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function withConcurrencyLimit<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  concurrency: number = 3,
  delayBetweenStarts: number = 200
): Promise<any[]> {
  const results: any[] = new Array(items.length);
  let running = 0;
  let nextIndex = 0;
  let done = false;

  return new Promise<any[]>((resolve) => {
    async function processItem(index: number): Promise<void> {
      if (done) return;
      running++;
      try {
        results[index] = await fn(items[index]);
      } catch (error) {
        console.error(`⚠️ 第 ${index + 1} 个块向量化失败: ${(error as Error)?.message || error}`);
        results[index] = null;
      } finally {
        running--;
        if (done) return;
        const next = nextIndex++;
        if (next < items.length) {
          await sleep(delayBetweenStarts);
          processItem(next);
        }
      }
    }

    const initialBatch = Math.min(concurrency, items.length);
    for (let i = 0; i < initialBatch; i++) {
      nextIndex++;
      processItem(i);
    }

    let finished = 0;
    const total = items.length;
    const check = setInterval(() => {
      const nonNull = results.filter((r) => r !== undefined).length;
      if (nonNull !== finished) {
        finished = nonNull;
        console.log(`📊 Embedding 进度: ${finished}/${total}`);
      }
      if (finished >= total) {
        clearInterval(check);
        resolve(results);
      }
    }, 2000);
  });
}

class VectorStoreService {
  private db: Connection | null = null;
  private table: Table | null = null;
  private embeddingConfig: EmbeddingConfig | null = null;
  private expectedVectorDimension: number | null = null;
  private migrationPromise: Promise<void> | null = null;

  constructor() {
    console.log("🔑 向量存储服务初始化中...");
  }

  private async getEmbeddingConfig(): Promise<EmbeddingConfig> {
    if (!this.embeddingConfig) {
      this.embeddingConfig = await loadEmbeddingConfig();
      console.log(`🔑 使用嵌入模型: ${this.embeddingConfig.model} (${this.embeddingConfig.provider})`);
    }
    return this.embeddingConfig;
  }

  /**
   * 调用嵌入 API 生成向量（纯文本嵌入，图片已在上游转为文字描述）
   */
  private async getEmbedding(chunk: DocumentChunk | string): Promise<number[]> {
    try {
      const config = await this.getEmbeddingConfig();
      if (!config.apiKey) {
        throw new Error("未配置 Embedding API Key，请在 model-config.json 或环境变量中配置");
      }
      const embeddingUrl = getEmbeddingUrl(config);
      const text = typeof chunk === "string" ? chunk : chunk.pageContent || "[空块]";

      const requestBody: any = {
        model: config.model,
        input: text,
      };

      const response = await fetch(embeddingUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `❌ Embedding API 错误: ${response.status} ${response.statusText}`
        );
        console.error(`错误详情: ${errorText}`);
        throw new Error(`Embedding API 调用失败: ${response.statusText}`);
      }

      const data: any = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error("❌ Embedding 生成失败:", error);
      throw error;
    }
  }

  private async getExpectedVectorDimension(): Promise<number> {
    if (this.expectedVectorDimension !== null) {
      return this.expectedVectorDimension;
    }

    this.expectedVectorDimension = (await this.getEmbedding("向量维度检测")).length;
    return this.expectedVectorDimension;
  }

  private async getExistingVectorDimension(): Promise<number | null> {
    if (!this.table) {
      return null;
    }

    const schema = await this.table.schema;
    const vectorField = schema.fields.find((field) => field.name === "vector");
    const vectorType: any = vectorField?.type;

    if (!vectorType) {
      return null;
    }

    if (typeof vectorType.listSize === "number") {
      return vectorType.listSize;
    }

    const match = String(vectorType).match(/FixedSizeList\[(\d+)\]/);
    return match ? Number(match[1]) : null;
  }

  private async getTableFieldNames(): Promise<Set<string>> {
    if (!this.table) {
      return new Set();
    }

    const schema = await this.table.schema;
    return new Set(schema.fields.map((field) => field.name));
  }

  private normalizeStoredRecord(row: Record<string, unknown>): StoredRecord {
    const type = row.type;
    return {
      text: String(row.text ?? ""),
      imageContent: String(row.imageContent ?? ""),
      source: String(row.source ?? ""),
      filename: String(row.filename ?? ""),
      chunkIndex: Number(row.chunkIndex ?? 0),
      type: type === "image" || type === "page" ? type : "text",
    };
  }

  private async scanTableRows(): Promise<StoredRecord[]> {
    await this.initialize();
    if (!this.table) {
      return [];
    }

    const total = await this.table.countRows("filename IS NOT NULL");
    if (total === 0) {
      return [];
    }

    const fieldNames = await this.getTableFieldNames();
    const selectableFields = ["text", "imageContent", "source", "filename", "chunkIndex", "type"].filter(
      (field) => fieldNames.has(field)
    );

    const rows = await this.table
      .filter("filename IS NOT NULL")
      .select(selectableFields)
      .limit(total)
      .execute<Record<string, unknown>>();

    return rows
      .map((row) => this.normalizeStoredRecord(row))
      .filter((row) => row.filename && row.filename !== INIT_FILENAME);
  }

  private async vectorizeChunks(chunks: DocumentChunk[]): Promise<VectorizedRecord[]> {
    const config = await this.getEmbeddingConfig();
    const concurrency = config.provider === "qwen" ? 2 : 5;
    const delayMs = config.provider === "qwen" ? 500 : 200;

    console.log(`📊 开始向量化 ${chunks.length} 个文档块 (并发: ${concurrency}, Qwen限速保护)`);

    const results = await withConcurrencyLimit(
      chunks,
      async (chunk: DocumentChunk) =>
        withRetry(async () => {
          const vector = await this.getEmbedding(chunk);
          return {
            vector,
            text: chunk.pageContent || "[图片块]",
            imageContent: chunk.imageContent || "",
            source: chunk.metadata.source,
            filename: chunk.metadata.filename,
            chunkIndex: chunk.metadata.chunkIndex,
            type: chunk.metadata.type || "text",
          } as VectorizedRecord;
        }),
      concurrency,
      delayMs
    );

    const records = results.filter((record): record is VectorizedRecord => record !== null && record !== undefined);

    if (records.length === 0) {
      throw new Error("所有文档块向量化均失败");
    }

    const skipped = results.length - records.length;
    if (skipped > 0) {
      console.log(`⚠️ ${skipped}/${results.length} 个块失败已跳过，成功 ${records.length} 个`);
    }

    return records;
  }

  private recordToChunk(record: StoredRecord): DocumentChunk {
    return {
      pageContent: record.text,
      imageContent: record.imageContent || undefined,
      metadata: {
        source: record.source,
        filename: record.filename,
        chunkIndex: record.chunkIndex,
        type: record.type,
      },
    };
  }

  private async rebuildTable(records: VectorizedRecord[]): Promise<void> {
    this.table = null;
    this.db = null;

    try {
      await fs.rm(DB_PATH, { recursive: true, force: true });
      console.log("✅ 已删除旧数据库");
    } catch (error) {
      console.log(`⚠️ 删除旧数据库目录时出现问题，继续重建: ${error}`);
    }

    this.db = await connect(DB_PATH);

    if (records.length > 0) {
      this.table = await this.db.createTable(TABLE_NAME, this.toTableRecords(records));
      console.log(`✅ 已重建向量表，共恢复 ${records.length} 条记录`);
    } else {
      this.table = null;
      console.log("✅ 已重建为空数据库，等待新文档写入");
    }
  }

  private toTableRecords(records: VectorizedRecord[]): Array<Record<string, unknown>> {
    return records.map((record) => ({
      vector: record.vector,
      text: record.text,
      imageContent: record.imageContent,
      source: record.source,
      filename: record.filename,
      chunkIndex: record.chunkIndex,
      type: record.type,
    }));
  }

  private async ensureTableCompatibility(incomingRecords: VectorizedRecord[]): Promise<void> {
    if (!this.table || incomingRecords.length === 0) {
      return;
    }

    const existingDimension = await this.getExistingVectorDimension();
    const incomingDimension = incomingRecords[0].vector.length;

    if (existingDimension === null || existingDimension === incomingDimension) {
      return;
    }

    if (!this.migrationPromise) {
      this.migrationPromise = (async () => {
        console.warn(
          `⚠️ 检测到向量维度变化: 旧表 ${existingDimension} 维，新模型 ${incomingDimension} 维。开始自动迁移旧数据...`
        );

        const oldRows = await this.scanTableRows();
        if (oldRows.length === 0) {
          await this.rebuildTable([]);
          return;
        }

        const oldChunks = oldRows.map((row) => this.recordToChunk(row));
        const migratedRecords = await this.vectorizeChunks(oldChunks);
        await this.rebuildTable(migratedRecords);
      })();
    }

    try {
      await this.migrationPromise;
    } finally {
      this.migrationPromise = null;
    }
  }

  private escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
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
      const records = await this.vectorizeChunks(chunks);
      await this.ensureTableCompatibility(records);

      if (!this.table) {
        this.table = await this.db!.createTable(TABLE_NAME, this.toTableRecords(records));
        console.log("✅ 创建新表:", TABLE_NAME);
      } else {
        await this.table.add(this.toTableRecords(records));
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
    topK: number = 10,
    minScore: number = 0.35 // 最小相似度阈值（0-1，越高越严格）
  ): Promise<DocumentChunk[]> {
    await this.initialize();
    if (!this.table) {
      console.log("⚠️ 向量库为空，请先上传文档");
      return [];
    }

    try {
      const queryVector = await this.getEmbedding(query);
      const existingDimension = await this.getExistingVectorDimension();
      if (existingDimension !== null && queryVector.length !== existingDimension) {
        throw new Error(
          `当前知识库使用 ${existingDimension} 维向量，但当前嵌入模型返回 ${queryVector.length} 维。请重新上传文档或清空知识库后重建索引。`
        );
      }
      const results = await this.table
        .search(queryVector)
        .limit(topK * 2) // 多检索一些，然后过滤
        .execute();

      // 过滤并记录相似度分数
      const filteredResults = results
        .filter((r: any) => r.filename !== "init") // 过滤初始化数据
        .map((result: any) => ({
          pageContent: result.text,
          imageContent: result.imageContent || undefined,
          metadata: {
            source: result.source,
            filename: result.filename,
            chunkIndex: result.chunkIndex,
            type: result.type || "text",
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
    try {
      const rows = await this.scanTableRows();
      return rows.map((row) => this.recordToChunk(row));
    } catch (error) {
      console.error("❌ 获取所有文档块失败:", error);
      return [];
    }
  }

  // 用 SQL LIKE 实现关键词精确匹配（避免加载全表到 JS 内存）
  async keywordSearch(
    query: string,
    topK: number = 8
  ): Promise<DocumentChunk[]> {
    await this.initialize();
    if (!this.table) return [];

    const searchTerms = normalizeSearchText(query)
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 10);

    if (searchTerms.length === 0) return [];

    try {
      const likeConditions = searchTerms
        .map((term) => {
          const escaped = term.replace(/'/g, "''");
          return `(text LIKE '%${escaped}%' OR filename LIKE '%${escaped}%')`;
        })
        .join(" AND ");

      const rows = await (this.table as any)
        .filter(`filename != '${INIT_FILENAME}' AND (${likeConditions})`)
        .limit(topK * 2)
        .execute();

      const scored = rows.map((row: any) => {
        const record = this.normalizeStoredRecord(row);
        let score = 0;
        searchTerms.forEach((term) => {
          const t = term.toLowerCase();
          const text = (record.text || "").toLowerCase();
          const fn = (record.filename || "").toLowerCase();
          if (text.includes(t)) score += text.split(t).length - 1;
          if (fn.includes(t)) score += 3; // 文件名命中权重更高
        });
        return { chunk: this.recordToChunk(record), score };
      });

      const results = scored
        .filter((r: any) => r.score > 0)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, topK)
        .map((r: any) => r.chunk);

      results.forEach((chunk: any, index: number) => {
        console.log(
          `✓ 关键词匹配 ${index + 1}: [${chunk.metadata.filename}]`
        );
      });

      return results;
    } catch (error) {
      console.error("❌ 关键词检索失败:", error);
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
    try {
      const rows = await this.scanTableRows();
      const vectorDimension = (await this.getExistingVectorDimension()) || (await this.getExpectedVectorDimension());
      return rows.map((row) => ({
        filename: row.filename,
        chunkIndex: row.chunkIndex,
        text: row.text,
        vectorDimension,
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
    try {
      const rows = await this.scanTableRows();
      const fileMap = new Map<string, number>();
      rows.forEach((row) => {
        if (row.filename) {
          fileMap.set(row.filename, (fileMap.get(row.filename) || 0) + 1);
        }
      });

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
    if (!this.table && !this.db) {
      console.log("⚠️ 向量库为空，无需删除");
      return 0;
    }

    try {
      console.log("🔍 开始删除所有文档");
      const totalCount = this.table ? await this.table.countRows("filename IS NOT NULL") : 0;
      console.log(`📊 将删除所有 ${totalCount} 条记录`);
      await this.rebuildTable([]);

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
      const escapedFilename = this.escapeSqlString(filename);
      const deletedCount = await this.table.countRows(`filename = '${escapedFilename}'`);
      console.log(`🗑️ 将删除 ${deletedCount} 条记录`);

      if (deletedCount > 0) {
        await this.table.delete(`filename = '${escapedFilename}'`);
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
