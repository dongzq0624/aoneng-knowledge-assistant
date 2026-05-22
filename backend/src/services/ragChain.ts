// RAG 检索增强生成服务
import dotenv from "dotenv";
dotenv.config(); // 确保环境变量已加载

import { ChatOpenAI } from "@langchain/openai";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import fs from "fs/promises";
import path from "path";
import { vectorStore } from "./vectorstore.js";
import type {
  ChatMessage,
  DocumentChunk,
  SourceReference,
} from "../types.js";

// 默认配置（作为后备）
const DEFAULT_GLM_API_KEY = process.env.GLM_API_KEY || "";
const DEFAULT_GLM_BASE_URL = process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEFAULT_DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const DEFAULT_QWEN_API_KEY = process.env.QWEN_API_KEY || "";
const DEFAULT_QWEN_BASE_URL = process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";

interface ModelConfig {
  provider: "glm" | "deepseek" | "qwen";
  glmApiKey: string;
  glmBaseUrl: string;
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  qwenApiKey: string;
  qwenBaseUrl: string;
  preprocessingModel: string;
  generationModel: string;
  temperature: number;
  maxTokens: number;
  embeddingModel: string;
}

interface RankedDocument {
  doc: DocumentChunk;
  score: number;
  bm25Score: number;
  vectorScore: number;
  matchedTerms: string[];
}

interface BM25SearchResult {
  doc: DocumentChunk;
  score: number;
  matchedTerms: string[];
}

const BM25_K1 = 1.5;
const BM25_B = 0.75;
const HYBRID_RRF_K = 50;

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[images_data\][\s\S]*?\[\/images_data\]/gi, " ")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawTerm of terms) {
    const term = normalizeSearchText(rawTerm);
    if (!term || seen.has(term)) {
      continue;
    }
    seen.add(term);
    result.push(term);
  }

  return result;
}

function tokenizeBM25Text(text: string): string[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) {
    return [];
  }

  const tokens: string[] = [];

  for (const segment of normalized.split(" ")) {
    if (!segment) {
      continue;
    }

    tokens.push(segment);

    if (/^[\u4e00-\u9fa5]+$/.test(segment)) {
      if (segment.length >= 2) {
        for (let i = 0; i <= segment.length - 2; i++) {
          tokens.push(segment.slice(i, i + 2));
        }
      }

      if (segment.length >= 3) {
        for (let i = 0; i <= segment.length - 3; i++) {
          tokens.push(segment.slice(i, i + 3));
        }
      }
    }
  }

  return tokens;
}

function buildSearchTerms(
  question: string,
  rewrittenQuery: string,
  keywords: string[]
): string[] {
  const baseTerms = [
    ...keywords,
    question,
    rewrittenQuery,
    ...question.split(/[\s,，。！？、；：/]+/),
    ...rewrittenQuery.split(/[\s,，。！？、；：/]+/),
  ];

  const terms = uniqueTerms(baseTerms).flatMap((term) => {
    const derived = [term];

    if (/^[\u4e00-\u9fa5]{4,8}$/.test(term)) {
      for (let i = 0; i <= term.length - 2; i++) {
        derived.push(term.slice(i, i + 2));
      }
      for (let i = 0; i <= term.length - 3; i++) {
        derived.push(term.slice(i, i + 3));
      }
    }

    return derived;
  });

  return uniqueTerms(terms).filter((term) => term.length >= 2);
}

function countOccurrences(text: string, term: string): number {
  if (!text || !term) {
    return 0;
  }

  let count = 0;
  let startIndex = 0;

  while (true) {
    const index = text.indexOf(term, startIndex);
    if (index === -1) {
      break;
    }
    count++;
    startIndex = index + term.length;
  }

  return count;
}

async function bm25Search(
  docs: DocumentChunk[],
  question: string,
  rewrittenQuery: string,
  keywords: string[],
  topK: number = 10
): Promise<BM25SearchResult[]> {
  const queryTerms = buildSearchTerms(question, rewrittenQuery, keywords);
  if (queryTerms.length === 0) {
    return [];
  }

  const preparedDocs = docs.map((doc) => {
    const weightedText = `${doc.metadata.filename} ${doc.metadata.filename} ${doc.pageContent}`;
    const tokens = tokenizeBM25Text(weightedText);
    const tf = new Map<string, number>();

    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    return {
      doc,
      tf,
      tokensLength: tokens.length || 1,
      tokenSet: new Set(tokens),
    };
  });

  const avgDocLength =
    preparedDocs.reduce((sum, item) => sum + item.tokensLength, 0) /
    preparedDocs.length;
  const docCount = preparedDocs.length;
  const docFreq = new Map<string, number>();

  for (const term of queryTerms) {
    let count = 0;
    for (const item of preparedDocs) {
      if (item.tokenSet.has(term)) {
        count++;
      }
    }
    docFreq.set(term, count);
  }

  const scored = preparedDocs
    .map((item) => {
      let score = 0;
      const matchedTerms: string[] = [];

      for (const term of queryTerms) {
        const tf = item.tf.get(term) || 0;
        if (tf === 0) {
          continue;
        }

        const df = docFreq.get(term) || 0;
        const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
        const numerator = tf * (BM25_K1 + 1);
        const denominator =
          tf + BM25_K1 * (1 - BM25_B + BM25_B * (item.tokensLength / avgDocLength));

        score += idf * (numerator / denominator);
        matchedTerms.push(term);
      }

      return {
        doc: item.doc,
        score,
        matchedTerms: [...new Set(matchedTerms)],
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  scored.forEach((item, index) => {
    console.log(
      `🔍 BM25 排序 ${index + 1}: [${item.doc.metadata.filename}] score=${item.score.toFixed(4)} terms=${item.matchedTerms.join(", ")}`
    );
  });

  return scored;
}

function rankRetrievedDocuments(
  vectorDocs: DocumentChunk[],
  bm25Docs: BM25SearchResult[]
): RankedDocument[] {
  const merged = new Map<
    string,
    {
      doc: DocumentChunk;
      vectorRank: number | null;
      bm25Rank: number | null;
      bm25Score: number;
      matchedTerms: string[];
    }
  >();

  vectorDocs.forEach((doc, index) => {
    const id = `${doc.metadata.filename}-${doc.metadata.chunkIndex}`;
    const existing = merged.get(id);
    merged.set(id, {
      doc,
      vectorRank: index,
      bm25Rank: existing?.bm25Rank ?? null,
      bm25Score: existing?.bm25Score ?? 0,
      matchedTerms: existing?.matchedTerms ?? [],
    });
  });

  bm25Docs.forEach((item, index) => {
    const id = `${item.doc.metadata.filename}-${item.doc.metadata.chunkIndex}`;
    const existing = merged.get(id);
    merged.set(id, {
      doc: item.doc,
      vectorRank: existing?.vectorRank ?? null,
      bm25Rank: index,
      bm25Score: item.score,
      matchedTerms: item.matchedTerms,
    });
  });

  return Array.from(merged.values())
    .map((entry) => {
      const vectorScore =
        entry.vectorRank !== null ? 1 / (HYBRID_RRF_K + entry.vectorRank + 1) : 0;
      const bm25RankScore =
        entry.bm25Rank !== null ? 1 / (HYBRID_RRF_K + entry.bm25Rank + 1) : 0;

      return {
        doc: entry.doc,
        score: vectorScore + bm25RankScore,
        bm25Score: entry.bm25Score,
        vectorScore,
        matchedTerms: entry.matchedTerms,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ==================== Cross-Encoder Rerank ====================

interface RerankResult {
  doc: DocumentChunk;
  rerankScore: number;
  originalIndex: number;
}

const RERANK_TOP_K = 12;   // Rerank 候选数量
const RERANK_THRESHOLD = 3; // 最低相关性分数（0-10）
const RERANK_MODEL = "BAAI/bge-reranker-large";

async function rerankWithCrossEncoder(
  question: string,
  docs: RankedDocument[]
): Promise<RerankResult[]> {
  if (docs.length === 0) return [];

  const candidates = docs.slice(0, RERANK_TOP_K);
  const hfToken = process.env.HUGGINGFACEHUB_API_TOKEN || "";

  try {
    console.log(`🔄 开始 Cross-Encoder Rerank，候选 ${candidates.length} 个文档...`);

    if (hfToken) {
      // 使用 HuggingFace Inference API 调用 bge-reranker-large
      const docPairs: [string, string][] = candidates.map((r) => [
        question,
        r.doc.pageContent.substring(0, 1500),
      ]);

      const response = await fetch(
        `https://api-inference.huggingface.co/models/${RERANK_MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: docPairs }),
        }
      );

      if (response.ok) {
        const scores = (await response.json()) as number[];

        const reranked = candidates
          .map((ranked, idx) => ({
            doc: ranked.doc,
            rerankScore: scores[idx] ?? 0,
            originalIndex: idx,
          }))
          .sort((a, b) => b.rerankScore - a.rerankScore);

        reranked.forEach((item, idx) => {
          console.log(
            `  ${idx + 1}. [${item.doc.metadata.filename}] Rerank分数: ${item.rerankScore.toFixed(4)}`
          );
        });

        console.log(`✅ Cross-Encoder Rerank 完成`);
        return reranked;
      }

      console.warn(
        `⚠️ HuggingFace Inference 返回错误 ${response.status}，降级为 LLM Rerank`
      );
    } else {
      console.log(`⚠️ 未配置 HUGGINGFACEHUB_API_TOKEN，降级为 LLM Rerank`);
    }
  } catch (error) {
    console.warn(`⚠️ Cross-Encoder Rerank 失败，降级为 LLM Rerank:`, error);
  }

  // 降级：使用 LLM 评分（每个文档一次 LLM 调用，batch 并行）
  console.log(`🔄 开始 LLM Rerank（降级模式）...`);
  const scored = await Promise.all(
    candidates.map(async (ranked, idx) => {
      const rerankPrompt = `请评估以下文档内容与用户问题的相关性，给出 0-10 的评分（10 表示非常相关，0 表示完全不相关）。
只返回数字评分，不要有其他内容。

用户问题：${question}

文档内容：
${ranked.doc.pageContent.substring(0, 800)}

相关性评分（0-10）：`;

      try {
        const response = await getPreprocessingLLM().invoke(rerankPrompt);
        const scoreText = response.content.toString().trim();
        const score = parseFloat(scoreText);
        const validScore = isNaN(score) ? 5 : Math.max(0, Math.min(10, score));

        return {
          doc: ranked.doc,
          rerankScore: validScore,
          originalIndex: idx,
        };
      } catch {
        return {
          doc: ranked.doc,
          rerankScore: 5,
          originalIndex: idx,
        };
      }
    })
  );

  const result = scored.sort((a, b) => b.rerankScore - a.rerankScore);

  result.forEach((item, idx) => {
    console.log(
      `  ${idx + 1}. [${item.doc.metadata.filename}] Rerank分数: ${item.rerankScore}/10`
    );
  });

  console.log(`✅ LLM Rerank 完成`);
  return result;
}

// 判断模型属于哪个提供商
function getModelProvider(modelName: string): "glm" | "deepseek" | "qwen" {
  if (modelName.startsWith("deepseek") || modelName.startsWith("ds-")) {
    return "deepseek";
  }
  if (modelName.startsWith("qwen") || modelName.startsWith("text-embedding")) {
    return "qwen";
  }
  return "glm";
}

// 根据模型名称获取对应的配置（使用配置文件中的值）
function getModelConfig(modelName: string) {
  const provider = getModelProvider(modelName);
  
  if (provider === "deepseek") {
    return {
      apiKey: modelConfig?.deepseekApiKey || DEFAULT_DEEPSEEK_API_KEY,
      baseURL: modelConfig?.deepseekBaseUrl || DEFAULT_DEEPSEEK_BASE_URL,
      provider: "DeepSeek" as const,
    };
  }
  
  if (provider === "qwen") {
    return {
      apiKey: modelConfig?.qwenApiKey || DEFAULT_QWEN_API_KEY,
      baseURL: modelConfig?.qwenBaseUrl || DEFAULT_QWEN_BASE_URL,
      provider: "千问Qwen" as const,
    };
  }
  
  return {
    apiKey: modelConfig?.glmApiKey || DEFAULT_GLM_API_KEY,
    baseURL: modelConfig?.glmBaseUrl || DEFAULT_GLM_BASE_URL,
    provider: "智谱GLM" as const,
  };
}

async function loadModelConfig(): Promise<ModelConfig> {
  const CONFIG_FILE = path.join(process.cwd(), "model-config.json");
  
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(data);
    
    console.log("✅ 已加载模型配置文件");
    
    if (config.model || config.preprocessingModel) {
      return {
        provider: config.provider || "glm",
        glmApiKey: config.glmApiKey || DEFAULT_GLM_API_KEY,
        glmBaseUrl: config.glmBaseUrl || DEFAULT_GLM_BASE_URL,
        deepseekApiKey: config.deepseekApiKey || DEFAULT_DEEPSEEK_API_KEY,
        deepseekBaseUrl: config.deepseekBaseUrl || DEFAULT_DEEPSEEK_BASE_URL,
        qwenApiKey: config.qwenApiKey || DEFAULT_QWEN_API_KEY,
        qwenBaseUrl: config.qwenBaseUrl || DEFAULT_QWEN_BASE_URL,
        preprocessingModel: config.preprocessingModel || config.model || process.env.GLM_MODEL || "glm-4-flash",
        generationModel: config.generationModel || config.model || process.env.GLM_MODEL || "glm-4-flash",
        temperature: config.temperature || 0.7,
        maxTokens: config.maxTokens || 2000,
        embeddingModel: config.embeddingModel || process.env.GLM_EMBEDDING_MODEL || "embedding-3",
      };
    }
    
    return {
      provider: config.provider || "glm",
      glmApiKey: config.glmApiKey || DEFAULT_GLM_API_KEY,
      glmBaseUrl: config.glmBaseUrl || DEFAULT_GLM_BASE_URL,
      deepseekApiKey: config.deepseekApiKey || DEFAULT_DEEPSEEK_API_KEY,
      deepseekBaseUrl: config.deepseekBaseUrl || DEFAULT_DEEPSEEK_BASE_URL,
      qwenApiKey: config.qwenApiKey || DEFAULT_QWEN_API_KEY,
      qwenBaseUrl: config.qwenBaseUrl || DEFAULT_QWEN_BASE_URL,
      preprocessingModel: config.preprocessingModel || process.env.GLM_MODEL || "glm-4-flash",
      generationModel: config.generationModel || process.env.GLM_MODEL || "glm-4-flash",
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 2000,
      embeddingModel: config.embeddingModel || process.env.GLM_EMBEDDING_MODEL || "embedding-3",
    };
  } catch (error) {
    console.log("⚠️ 未找到模型配置文件，使用默认配置");
    
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        provider: "glm" as const,
        glmApiKey: DEFAULT_GLM_API_KEY,
        glmBaseUrl: DEFAULT_GLM_BASE_URL,
        deepseekApiKey: DEFAULT_DEEPSEEK_API_KEY,
        deepseekBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
        qwenApiKey: DEFAULT_QWEN_API_KEY,
        qwenBaseUrl: DEFAULT_QWEN_BASE_URL,
        preprocessingModel: process.env.GLM_MODEL || "glm-4-flash",
        generationModel: process.env.GLM_MODEL || "glm-4-flash",
        temperature: 0.7,
        maxTokens: 2000,
        embeddingModel: process.env.GLM_EMBEDDING_MODEL || "embedding-3",
      };
    }
    
    throw error;
  }
}

let modelConfig: ModelConfig;

// 初始化模型（异步）
export async function initializeModels(): Promise<void> {
  try {
    modelConfig = await loadModelConfig();
    
    const preProvider = getModelProvider(modelConfig.preprocessingModel);
    const genProvider = getModelProvider(modelConfig.generationModel);
    const preConfig = getModelConfig(modelConfig.preprocessingModel);
    const genConfig = getModelConfig(modelConfig.generationModel);
    
    console.log("\n🤖 模型配置信息:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`🎯 当前提供商: ${modelConfig.provider.toUpperCase()}`);
    console.log(`🔑 智谱 API Key: ${modelConfig.glmApiKey ? "已配置 (长度: " + modelConfig.glmApiKey.length + ")" : "未配置"}`);
    console.log(`🌐 智谱 Base URL: ${modelConfig.glmBaseUrl}`);
    console.log(`🔑 DeepSeek API Key: ${modelConfig.deepseekApiKey ? "已配置 (长度: " + modelConfig.deepseekApiKey.length + ")" : "未配置"}`);
    console.log(`🌐 DeepSeek Base URL: ${modelConfig.deepseekBaseUrl}`);
    console.log(`🔑 千问 API Key: ${modelConfig.qwenApiKey ? "已配置 (长度: " + modelConfig.qwenApiKey.length + ")" : "未配置"}`);
    console.log(`🌐 千问 Base URL: ${modelConfig.qwenBaseUrl}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`⚡ 预处理模型: ${modelConfig.preprocessingModel} (${preConfig.provider})`);
    console.log(`💬 生成回答模型: ${modelConfig.generationModel} (${genConfig.provider})`);
    console.log(`🌡️ 温度: ${modelConfig.temperature}`);
    console.log(`📊 最大Token数: ${modelConfig.maxTokens}`);
    console.log(`🧩 嵌入模型: ${modelConfig.embeddingModel}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error) {
    console.error("❌ 加载模型配置失败:", error);
    
    // 使用默认配置作为后备
    modelConfig = {
      provider: "glm",
      glmApiKey: DEFAULT_GLM_API_KEY,
      glmBaseUrl: DEFAULT_GLM_BASE_URL,
      deepseekApiKey: DEFAULT_DEEPSEEK_API_KEY,
      deepseekBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
      qwenApiKey: DEFAULT_QWEN_API_KEY,
      qwenBaseUrl: DEFAULT_QWEN_BASE_URL,
      preprocessingModel: process.env.GLM_MODEL || "glm-4-flash",
      generationModel: process.env.GLM_MODEL || "glm-4-flash",
      temperature: 0.7,
      maxTokens: 2000,
      embeddingModel: process.env.GLM_EMBEDDING_MODEL || "embedding-3",
    };
  }
}

// 获取当前配置的辅助函数
function getConfig(): ModelConfig {
  if (!modelConfig) {
    return {
      provider: "glm",
      glmApiKey: DEFAULT_GLM_API_KEY,
      glmBaseUrl: DEFAULT_GLM_BASE_URL,
      deepseekApiKey: DEFAULT_DEEPSEEK_API_KEY,
      deepseekBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
      qwenApiKey: DEFAULT_QWEN_API_KEY,
      qwenBaseUrl: DEFAULT_QWEN_BASE_URL,
      preprocessingModel: process.env.GLM_MODEL || "glm-4-flash",
      generationModel: process.env.GLM_MODEL || "glm-4-flash",
      temperature: 0.7,
      maxTokens: 2000,
      embeddingModel: process.env.GLM_EMBEDDING_MODEL || "embedding-3",
    };
  }
  return modelConfig;
}

// 初始化预处理 LLM（用于关键词提取和查询改写）
function createPreprocessingLLM() {
  const config = getConfig();
  const modelConfig = getModelConfig(config.preprocessingModel);
  
  return new ChatOpenAI({
    openAIApiKey: modelConfig.apiKey,
    modelName: config.preprocessingModel,
    temperature: 0.3,
    configuration: {
      baseURL: modelConfig.baseURL,
    },
  });
}

// 初始化生成回答 LLM（用于最终回答，支持多模态）
function createGenerationLLM() {
  const config = getConfig();
  const modelConfig = getModelConfig(config.generationModel);
  
  const isMultimodal = config.generationModel.includes("vl") || config.generationModel.includes("vision") || config.generationModel === "glm-4v-flash";
  
  return new ChatOpenAI({
    openAIApiKey: modelConfig.apiKey,
    modelName: config.generationModel,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    streaming: true,
    configuration: {
      baseURL: modelConfig.baseURL,
    },
  });
}

// 延迟初始化的LLM实例
let _preprocessingLLM: ChatOpenAI | null = null;
let _generationLLM: ChatOpenAI | null = null;

function getPreprocessingLLM(): ChatOpenAI {
  if (!_preprocessingLLM) {
    _preprocessingLLM = createPreprocessingLLM();
  }
  return _preprocessingLLM;
}

function getGenerationLLM(): ChatOpenAI {
  if (!_generationLLM) {
    _generationLLM = createGenerationLLM();
  }
  return _generationLLM;
}

// 格式化聊天历史
function formatHistory(history: ChatMessage[]): string {
  if (!history || history.length === 0) return "无";
  return history
    .map((msg) => `${msg.role === "user" ? "用户" : "助手"}: ${msg.content}`)
    .join("\n");
}

// 构建 RAG 提示词
function buildRAGPrompt(
  context: string,
  history: string,
  question: string
): string {
  return `你是一个智能助手，请基于以下提供的上下文信息来回答用户的问题。

上下文信息：
${context}

聊天历史：
${history}

用户问题：${question}

回答要求：
1. **以上下文为准**：回答必须基于当前提供的上下文信息，即使与聊天历史中的回答不一致也没关系
2. **完整回答**：如果上下文中有多个要点、多个场景或多个步骤，请全部列出，不要遗漏
3. **精确回答**：只回答用户问题相关的内容，不要包含上下文中的无关信息
4. **诚实回答**：如果上下文中没有相关信息，请诚实地告诉用户你不知道，不要编造答案
5. **格式规则**：
   - 使用 Markdown 格式组织内容
 `;
}

// 提取关键词（使用快速模型）
function buildPolishedRAGPrompt(context: string, history: string): string {
  return `你是一个企业知识库问答助手。请严格依据当前提供的文档上下文回答，不要使用上下文之外的事实，不要臆测，不要跨文档补充。

【文档上下文】
${context}

【聊天历史】
${history}

【回答要求】
1. 事实必须严格以当前上下文为准；若上下文与聊天历史不一致，以当前上下文为准。
2. 在不改变事实、不新增信息、不省略关键点的前提下，可以对原文做自然、专业、易读的表述优化。
3. 优先直接回答用户问题，不要机械复述“严格依据上下文”“无遗漏无冗余”“以上几点”等元话术，除非用户明确要求。
4. 如果上下文中存在多个并列要点、步骤、痛点、结论或数据，请完整列出，不要遗漏。
5. 只回答与问题直接相关的信息，不要夹带无关背景。
6. 如果上下文没有答案，就明确说明“根据当前提供的文档上下文，暂无相关信息”，不要编造。
7. 若上下文包含数值、时间、地区、型号、规则等关键信息，尽量保留原表述和原数值。
8. 输出使用清晰的 Markdown；能用短段落说明时，优先短段落，只有在内容天然适合枚举时再使用列表。
9. 当用户要求“严格依据文档/上下文”时，理解为“事实受限于文档”，不是“必须逐字照抄文档”。
10. 不要输出“摘录如下”“直接完整摘录”“未增删推断”等模板化声明，除非用户明确要求保留。`;
}

async function extractKeywords(question: string): Promise<string[]> {
  try {
    const keywordPrompt = `请从以下问题中提取3-5个最重要的关键词，用于文档检索。
只返回关键词，用逗号分隔，不要有其他解释。

问题：${question}

关键词：`;

    const response = await getPreprocessingLLM().invoke(keywordPrompt);
    const keywordsText = response.content.toString().trim();
    const keywords = keywordsText
      .split(/[,，、]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    console.log(`🔑 提取关键词: [${keywords.join(", ")}]`);
    return keywords;
  } catch (error) {
    console.log("⚠️ 关键词提取失败:", error);
    return [];
  }
}

// 查询改写：提取关键词和优化查询（使用快速模型）
async function rewriteQuery(question: string): Promise<string> {
  try {
    const rewritePrompt = `请从以下问题中提取关键词，并生成一个更适合文档检索的查询语句。
只返回优化后的查询语句，不要有其他解释。

原问题：${question}

优化后的查询：`;

    const response = await getPreprocessingLLM().invoke(rewritePrompt);
    const rewrittenQuery = response.content.toString().trim();
    console.log(`📝 查询改写: "${question}" → "${rewrittenQuery}"`);
    return rewrittenQuery;
  } catch (error) {
    console.log("⚠️ 查询改写失败，使用原查询:", error);
    return question;
  }
}

// 关键词匹配：在文档中查找包含关键词的块
async function keywordSearch(
  keywords: string[],
  topK: number = 5
): Promise<any[]> {
  if (keywords.length === 0) return [];

  try {
    console.log(`🔍 关键词检索: [${keywords.join(", ")}]`);

    // 获取所有文档
    const allDocs = await vectorStore.getAllDocumentChunks();

    // 计算每个文档块的关键词匹配分数
    const scoredDocs = allDocs.map((doc) => {
      const content = doc.pageContent.toLowerCase();
      let score = 0;
      let matchedKeywords: string[] = [];

      keywords.forEach((keyword) => {
        const kw = keyword.toLowerCase();
        if (content.includes(kw)) {
          // 计算关键词出现次数
          const matches = content.split(kw).length - 1;
          score += matches;
          matchedKeywords.push(keyword);
        }
      });

      return { doc, score, matchedKeywords };
    });

    // 只保留有匹配的文档，按分数排序
    const matchedDocs = scoredDocs
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    matchedDocs.forEach((item, index) => {
      console.log(
        `✓ 关键词匹配 ${index + 1}: [${item.doc.metadata.filename}] 匹配度: ${
          item.score
        } (关键词: ${item.matchedKeywords.join(", ")})`
      );
    });

    return matchedDocs.map((item) => item.doc);
  } catch (error) {
    console.log("⚠️ 关键词检索失败:", error);
    return [];
  }
}

// Rerank：对检索结果进行相关性评分和重排序（已禁用，保留代码供参考）
async function rerankDocuments(question: string, docs: any[]): Promise<any[]> {
  if (docs.length === 0) return docs;

  try {
    console.log(`🔄 开始 Rerank，评估 ${docs.length} 个文档...`);

    // 为每个文档评分
    const scoredDocs = await Promise.all(
      docs.map(async (doc, index) => {
        const rerankPrompt = `请评估以下文档内容与用户问题的相关性，给出 0-10 的评分（10 表示非常相关，0 表示完全不相关）。
只返回数字评分，不要有其他内容。

用户问题：${question}

文档内容：
${doc.pageContent.substring(0, 800)}...

相关性评分（0-10）：`;

        try {
          const response = await getGenerationLLM().invoke(rerankPrompt);
          const scoreText = response.content.toString().trim();
          const score = parseFloat(scoreText);

          if (isNaN(score)) {
            console.log(`⚠️ 文档 ${index + 1} 评分失败，使用默认分数 5`);
            return { doc, score: 5 };
          }

          console.log(
            `✓ 文档 ${index + 1} [${doc.metadata.filename}] 评分: ${score}/10`
          );
          return { doc, score };
        } catch (error) {
          console.log(`⚠️ 文档 ${index + 1} 评分出错，使用默认分数 5`);
          return { doc, score: 5 };
        }
      })
    );

    // 按评分排序，只保留评分 >= 3 的文档（降低阈值以提高召回率）
    const rerankedDocs = scoredDocs
      .filter((item) => item.score >= 3)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.doc);

    console.log(
      `✅ Rerank 完成，保留 ${rerankedDocs.length}/${docs.length} 个高相关文档`
    );
    return rerankedDocs;
  } catch (error) {
    console.log("⚠️ Rerank 失败，返回原始结果");
    return docs;
  }
}

// RAG 查询（流式输出）
export async function* ragQuery(
  question: string,
  history: ChatMessage[] = []
): AsyncGenerator<{ type: string; content?: string; sources?: SourceReference[]; images?: string[] }, void, unknown> {
  try {
    // 1. 并行提取关键词 + 查询改写（节省串行等待时间）
    console.log("🔑 提取关键词 + 优化查询语句...");
    const [keywords, rewrittenQuery] = await Promise.all([
      extractKeywords(question),
      rewriteQuery(question),
    ]);

    // 2. 一次性加载全表文档（BM25 和后续上下文构建共用，避免重复扫描）
    const allDocs = await vectorStore.getAllDocumentChunks();
    if (allDocs.length === 0) {
      console.log("⚠️ 知识库为空，无法检索相关文档");
      yield { type: "sources", sources: [] };
      yield { type: "content", content: "当前知识库为空，请先上传文档后再提问。" };
      return;
    }
    console.log(`📚 知识库共 ${allDocs.length} 个文档块`);

    // 3. 向量检索（语义相似） + BM25 检索 并行执行
    console.log("🔍 向量检索 + BM25 检索中...");
    const [vectorResults, bm25Results] = await Promise.all([
      vectorStore.similaritySearch(rewrittenQuery, 10, 0.35),
      bm25Search(allDocs, question, rewrittenQuery, keywords, 10),
    ]);

    console.log(`✓ 向量检索找到 ${vectorResults.length} 个文档`);
    console.log(`✓ BM25 检索找到 ${bm25Results.length} 个文档`);

    // 4. RRF 混合排序融合
    const rankedDocs = rankRetrievedDocuments(
      vectorResults,
      bm25Results
    );

    // 5. Cross-Encoder Rerank（精准重排，过滤低相关文档）
    const rerankedDocs = await rerankWithCrossEncoder(question, rankedDocs);

    // 6. 应用 Rerank 阈值过滤，取 top 6
    const topDocs = rerankedDocs
      .filter((r) => r.rerankScore >= RERANK_THRESHOLD)
      .slice(0, 6)
      .map((r) => r.doc);
    
    const images: string[] = [];
    
    const context =
      topDocs.length > 0
        ? topDocs
            .map((doc, i) => {
              if ((doc.metadata.type === "image" || doc.metadata.type === "page") && doc.imageContent) {
                images.push(doc.imageContent);
                return `[页面图${images.length}: ${doc.metadata.filename}]\n页面多模态解读: ${doc.pageContent}`;
              }
              return `[文档${i + 1}: ${doc.metadata.filename}]\n${doc.pageContent}`;
            })
            .join("\n\n---\n\n")
        : "暂无相关文档";

    const sources = [...new Set(topDocs.map((d) => d.metadata.filename))];
    console.log(
      `✅ 最终使用 ${topDocs.length} 个文档块 (含 ${images.length} 张图片)，来自: ${sources.join(", ")}`
    );

    // 7. 先发送 sources（前端可立即显示来源）
    if (sources.length > 0) {
      yield { type: "sources", sources: sources.map((f) => ({ filename: f })) };
    }

    // 8. 构建提示词，图片描述已内嵌到上下文中
    const systemPromptText = buildPolishedRAGPrompt(
      context,
      formatHistory(history)
    );

    // 9. 构建多模态 Message：文本上下文 + 原始图片（让视觉模型能看图回答）
    const messageContent: any[] = [{ type: "text", text: question }];

    images.forEach(imgUrl => {
      messageContent.push({
        type: "image_url",
        image_url: { url: imgUrl }
      });
    });

    const messages = [
      new SystemMessage(systemPromptText),
      new HumanMessage({ content: messageContent })
    ];

    // 10. 先将图片数据发给前端（用于图文联动展示）
    if (images.length > 0) {
      yield { type: "images", images };
    }

    // 11. 流式调用 LLM
    console.log("🤖 调用 LLM 模型生成回答...");
    const stream = await getGenerationLLM().stream(messages);

    for await (const chunk of stream) {
      if (chunk.content) {
        yield { type: "content", content: chunk.content.toString() };
      }
    }

    console.log("✅ 回答生成完成");
  } catch (error) {
    console.error("❌ RAG 查询失败:", error);
    yield { type: "content", content: `抱歉，处理您的问题时出现错误: ${
      error instanceof Error ? error.message : "未知错误"
    }` };
  }
}

// 获取相关文档（用于显示引用来源）
export async function getRelevantSources(question: string): Promise<SourceReference[]> {
  try {
    const [keywords, rewrittenQuery] = await Promise.all([
      extractKeywords(question),
      rewriteQuery(question),
    ]);

    const allDocs = await vectorStore.getAllDocumentChunks();
    if (allDocs.length === 0) {
      return [];
    }

    const [vectorResults, bm25Results] = await Promise.all([
      vectorStore.similaritySearch(rewrittenQuery, 10, 0.35),
      bm25Search(allDocs, question, rewrittenQuery, keywords, 10),
    ]);

    const rankedDocs = rankRetrievedDocuments(
      vectorResults,
      bm25Results
    );

    const rerankedDocs = await rerankWithCrossEncoder(question, rankedDocs);

    const topDocs = rerankedDocs
      .filter((r) => r.rerankScore >= RERANK_THRESHOLD)
      .slice(0, 6)
      .map((r) => r.doc);
    const fileSet = new Set<string>();
    topDocs.forEach((doc) => {
      fileSet.add(doc.metadata.filename);
      console.log(`📄 文档来源: ${doc.metadata.filename}`);
    });

    const sources: SourceReference[] = Array.from(fileSet).map((filename) => ({
      filename,
    }));

    console.log("📚 处理后的来源信息:", sources);
    return sources;
  } catch (error) {
    console.error("❌ 获取来源失败:", error);
    return [];
  }
}
