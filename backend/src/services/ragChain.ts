// RAG 检索增强生成服务
import dotenv from "dotenv";
dotenv.config(); // 确保环境变量已加载

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import fs from "fs/promises";
import path from "path";
import { vectorStore } from "./vectorstore.js";
import type { ChatMessage, SourceReference } from "../types.js";

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
): AsyncGenerator<string, void, unknown> {
  try {
    // 1. 提取关键词
    console.log("🔑 提取关键词...");
    const keywords = await extractKeywords(question);

    // 2. 查询改写：优化检索查询
    console.log("📝 优化查询语句...");
    const rewrittenQuery = await rewriteQuery(question);

    // 3. 混合检索：向量检索 + 关键词检索
    console.log("🔍 混合检索相关文档...");

    // 3.1 向量检索（语义相似）- 降低阈值到 0.45，提高召回率
    const vectorDocs = await vectorStore.similaritySearch(
      rewrittenQuery,
      6,
      0.45
    );
    console.log(`✓ 向量检索找到 ${vectorDocs.length} 个文档`);

    // 3.2 关键词检索（精确匹配）
    const keywordDocs = await keywordSearch(keywords, 5);
    console.log(`✓ 关键词检索找到 ${keywordDocs.length} 个文档`);

    // 3.3 合并去重（优先保留向量检索结果）
    const mergedDocs = [...vectorDocs];
    const existingIds = new Set(
      vectorDocs.map((d) => `${d.metadata.filename}-${d.metadata.chunkIndex}`)
    );

    keywordDocs.forEach((doc) => {
      const id = `${doc.metadata.filename}-${doc.metadata.chunkIndex}`;
      if (!existingIds.has(id)) {
        mergedDocs.push(doc);
        existingIds.add(id);
      }
    });

    console.log(`✓ 合并后共 ${mergedDocs.length} 个候选文档`);

    // 4. Rerank：对检索结果重排序（暂时禁用，直接使用混合检索结果）
    // const relevantDocs = await rerankDocuments(question, mergedDocs);
    const relevantDocs = mergedDocs; // 直接使用混合检索结果

    // 5. 构建上下文（最多使用 top 4）
    const topDocs = relevantDocs.slice(0, 4);
    
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

    // 6. 构建提示词，图片描述已内嵌到上下文中
    const systemPromptText = buildRAGPrompt(
      context,
      formatHistory(history),
      question
    );

    // 7. 构建多模态 Message：文本上下文 + 原始图片（让视觉模型能看图回答）
    const messageContent: any[] = [
      { type: "text", text: systemPromptText }
    ];

    images.forEach(imgUrl => {
      messageContent.push({
        type: "image_url",
        image_url: { url: imgUrl }
      });
    });

    const messages = [
      new HumanMessage({ content: messageContent })
    ];

    // 8. 先将图片数据发给前端（用于图文联动展示）
    console.log("🤖 调用 LLM 模型生成回答...");
    
    if (images.length > 0) {
      const imagesJson = JSON.stringify(images);
      yield `[IMAGES_DATA]${imagesJson}[/IMAGES_DATA]`;
    }

    // 9. 流式调用 LLM
    const stream = await getGenerationLLM().stream(messages);

    for await (const chunk of stream) {
      if (chunk.content) {
        yield chunk.content.toString();
      }
    }

    console.log("✅ 回答生成完成");
  } catch (error) {
    console.error("❌ RAG 查询失败:", error);
    yield `抱歉，处理您的问题时出现错误: ${
      error instanceof Error ? error.message : "未知错误"
    }`;
  }
}

// 获取相关文档（用于显示引用来源）
export async function getRelevantSources(question: string): Promise<SourceReference[]> {
  try {
    // 使用相同的优化流程
    const keywords = await extractKeywords(question);
    const rewrittenQuery = await rewriteQuery(question);

    // 混合检索
    const vectorDocs = await vectorStore.similaritySearch(
      rewrittenQuery,
      6,
      0.45
    );
    const keywordDocs = await keywordSearch(keywords, 5);

    // 合并去重
    const mergedDocs = [...vectorDocs];
    const existingIds = new Set(
      vectorDocs.map((d) => `${d.metadata.filename}-${d.metadata.chunkIndex}`)
    );

    keywordDocs.forEach((doc) => {
      const id = `${doc.metadata.filename}-${doc.metadata.chunkIndex}`;
      if (!existingIds.has(id)) {
        mergedDocs.push(doc);
      }
    });

    // const relevantDocs = await rerankDocuments(question, mergedDocs);
    // const topDocs = relevantDocs.slice(0, 4);
    const topDocs = mergedDocs.slice(0, 4); // 直接使用混合检索结果

    // 按文件名分组
    const fileSet = new Set<string>();
    
    topDocs.forEach((doc) => {
      fileSet.add(doc.metadata.filename);
      console.log(`📄 文档来源: ${doc.metadata.filename}`);
    });

    // 转换为SourceReference数组
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
