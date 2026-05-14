// RAG 检索增强生成服务
import dotenv from "dotenv";
dotenv.config(); // 确保环境变量已加载

import { ChatOpenAI } from "@langchain/openai";
import { vectorStore } from "./vectorstore.js";
import type { ChatMessage } from "../types.js";

const GLM_API_KEY =
  process.env.GLM_API_KEY ||
  "a2b3968e02a440c2971691fa545a05d4.TD0pU9hvf17syzly";
const GLM_BASE_URL =
  process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const GLM_MODEL = process.env.GLM_MODEL || "glm-4-flash";
const USE_FAST_PREPROCESSING =
  process.env.USE_FAST_PREPROCESSING === "true" || false;

console.log("🔑 GLM API Key:", GLM_API_KEY ? "已配置" : "未配置");
console.log("🌐 GLM Base URL:", GLM_BASE_URL);
console.log("🤖 GLM Model:", GLM_MODEL);

// 初始化主 LLM（用于最终回答）
const llm = new ChatOpenAI({
  openAIApiKey: GLM_API_KEY,
  modelName: GLM_MODEL,
  temperature: 0.7,
  streaming: true,
  configuration: {
    baseURL: GLM_BASE_URL,
  },
});

// 初始化快速 LLM（用于关键词提取和查询改写）
// 根据配置决定是否使用快速模型进行预处理
const shouldUseFastPreprocessing =
  USE_FAST_PREPROCESSING && GLM_MODEL !== "glm-4-flash";

const fastLLM = shouldUseFastPreprocessing
  ? new ChatOpenAI({
      openAIApiKey: GLM_API_KEY,
      modelName: "glm-4-flash",
      temperature: 0.3,
      configuration: {
        baseURL: GLM_BASE_URL,
      },
    })
  : llm;

if (shouldUseFastPreprocessing) {
  console.log(
    `⚡ 快速预处理已启用: glm-4-flash 进行预处理，${GLM_MODEL} 生成最终回答`
  );
} else {
  console.log(`✅ 全程使用 ${GLM_MODEL} 模型`);
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

    const response = await fastLLM.invoke(keywordPrompt);
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

    const response = await fastLLM.invoke(rewritePrompt);
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
          const response = await llm.invoke(rerankPrompt);
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

    // 5. 构建上下文（最多使用 top 4，增加一个以提供更多信息）
    const topDocs = relevantDocs.slice(0, 4);
    const context =
      topDocs.length > 0
        ? topDocs
            .map(
              (doc, i) =>
                `[文档${i + 1}: ${doc.metadata.filename}]\n${doc.pageContent}`
            )
            .join("\n\n---\n\n")
        : "暂无相关文档";

    // 显示检索到的文档来源
    const sources = [...new Set(topDocs.map((d) => d.metadata.filename))];
    console.log(
      `✅ 最终使用 ${topDocs.length} 个高质量文档块，来自: ${sources.join(
        ", "
      )}`
    );

    // 6. 构建提示词
    const systemPrompt = buildRAGPrompt(
      context,
      formatHistory(history),
      question
    );

    // 7. 流式调用 LLM
    console.log("🤖 调用 LLM 模型生成回答...");
    const stream = await llm.stream(systemPrompt);

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
export async function getRelevantSources(question: string): Promise<string[]> {
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

    const uniqueFilenames = [
      ...new Set(topDocs.map((doc) => doc.metadata.filename)),
    ];
    return uniqueFilenames;
  } catch (error) {
    console.error("❌ 获取来源失败:", error);
    return [];
  }
}
