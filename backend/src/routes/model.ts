// 模型设置路由
import { Router } from "express";
import fs from "fs/promises";
import path from "path";

const router = Router();

const CONFIG_FILE = path.join(process.cwd(), "model-config.json");

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
  visionModel?: string;
  visionMaxTokens?: number;
  temperature: number;
  maxTokens: number;
  embeddingModel: string;
}

const defaultConfig: ModelConfig = {
  provider: "glm",
  glmApiKey: process.env.GLM_API_KEY || "",
  glmBaseUrl: process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
  qwenApiKey: process.env.QWEN_API_KEY || "",
  qwenBaseUrl: process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
  preprocessingModel: process.env.GLM_MODEL || "glm-4-flash",
  generationModel: process.env.GLM_MODEL || "glm-4-flash",
  visionModel: process.env.QWEN_VISION_MODEL || "qwen-vl-plus",
  visionMaxTokens: 1800,
  temperature: 0.7,
  maxTokens: 2000,
  embeddingModel: process.env.GLM_EMBEDDING_MODEL || "embedding-3",
};

async function loadConfig(): Promise<ModelConfig> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(data);
    
    // 兼容旧配置格式
    if (config.model || config.preprocessingModel) {
      return {
        ...defaultConfig,
        ...config,
        provider: config.provider || "glm",
        glmApiKey: config.glmApiKey || defaultConfig.glmApiKey,
        glmBaseUrl: config.glmBaseUrl || defaultConfig.glmBaseUrl,
        deepseekApiKey: config.deepseekApiKey || defaultConfig.deepseekApiKey,
        deepseekBaseUrl: config.deepseekBaseUrl || defaultConfig.deepseekBaseUrl,
        qwenApiKey: config.qwenApiKey || defaultConfig.qwenApiKey,
        qwenBaseUrl: config.qwenBaseUrl || defaultConfig.qwenBaseUrl,
        preprocessingModel: config.preprocessingModel || config.model || defaultConfig.preprocessingModel,
        generationModel: config.generationModel || config.model || defaultConfig.generationModel,
      };
    }
    
    return { ...defaultConfig, ...config };
  } catch {
    return defaultConfig;
  }
}

async function saveConfig(config: ModelConfig): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

router.get("/config", async (req, res) => {
  try {
    const config = await loadConfig();
    
    // 返回时隐藏API Key的完整内容（只显示部分）
    const safeConfig = {
      ...config,
      glmApiKey: config.glmApiKey ? `${config.glmApiKey.substring(0, 8)}...${config.glmApiKey.substring(config.glmApiKey.length - 4)}` : "",
      deepseekApiKey: config.deepseekApiKey ? `${config.deepseekApiKey.substring(0, 8)}...${config.deepseekApiKey.substring(config.deepseekApiKey.length - 4)}` : "",
      qwenApiKey: config.qwenApiKey ? `${config.qwenApiKey.substring(0, 8)}...${config.qwenApiKey.substring(config.qwenApiKey.length - 4)}` : "",
    };
    
    res.json({
      success: true,
      data: safeConfig,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取配置失败",
      error: error instanceof Error ? error.message : "未知错误",
    });
  }
});

router.put("/config", async (req, res) => {
  try {
    const newConfig: Partial<ModelConfig> = req.body;
    
    // 如果传入的是脱敏后的API Key（包含...），则保留原有值
    const currentConfig = await loadConfig();
    
    let glmApiKey = newConfig.glmApiKey || currentConfig.glmApiKey;
    let deepseekApiKey = newConfig.deepseekApiKey || currentConfig.deepseekApiKey;
    let qwenApiKey = newConfig.qwenApiKey || currentConfig.qwenApiKey;
    
    // 检查是否是脱敏后的值
    if (newConfig.glmApiKey && newConfig.glmApiKey.includes("...")) {
      glmApiKey = currentConfig.glmApiKey;
    }
    if (newConfig.deepseekApiKey && newConfig.deepseekApiKey.includes("...")) {
      deepseekApiKey = currentConfig.deepseekApiKey;
    }
    if (newConfig.qwenApiKey && newConfig.qwenApiKey.includes("...")) {
      qwenApiKey = currentConfig.qwenApiKey;
    }
    
    const updatedConfig: ModelConfig = {
      ...currentConfig,
      ...newConfig,
      glmApiKey,
      deepseekApiKey,
      qwenApiKey,
    };
    
    await saveConfig(updatedConfig);
    
    console.log("\n📝 模型配置已更新:");
    console.log(`   提供商: ${updatedConfig.provider}`);
    console.log(`   预处理模型: ${updatedConfig.preprocessingModel}`);
    console.log(`   生成回答模型: ${updatedConfig.generationModel}`);
    console.log(`   视觉解析模型: ${updatedConfig.visionModel || "未配置"}`);
    console.log(`   温度: ${updatedConfig.temperature}`);
    console.log(`   最大Token数: ${updatedConfig.maxTokens}\n`);
    
    res.json({
      success: true,
      message: "配置已更新，请重启后端服务以应用新配置",
      data: updatedConfig,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "更新配置失败",
      error: error instanceof Error ? error.message : "未知错误",
    });
  }
});

router.get("/models", async (req, res) => {
  try {
    const availableModels = [
      // 智谱 GLM 模型
      { id: "glm-4-flash", name: "GLM-4 Flash (快速)", description: "智谱 - 快速响应，适合简单任务和预处理", provider: "glm" },
      { id: "glm-4", name: "GLM-4 (标准)", description: "智谱 - 标准版，平衡性能与速度", provider: "glm" },
      { id: "glm-4-plus", name: "GLM-4 Plus (增强)", description: "智谱 - 增强版，性能更优", provider: "glm" },
      { id: "glm-4-air", name: "GLM-4 Air (轻量)", description: "智谱 - 轻量版，成本更低", provider: "glm" },
      { id: "glm-4v-flash", name: "GLM-4V Flash (多模态)", description: "智谱 - 多模态版本，支持图片理解和文本生成", provider: "glm" },
      
      // DeepSeek 模型
      { id: "deepseek-v4-flash", name: "DeepSeek-V4-Flash (推荐)", description: "DeepSeek - 最新版本，快速响应，完美对应GLM-4 Flash", provider: "deepseek" },
      { id: "deepseek-v3", name: "DeepSeek-V3 (标准)", description: "DeepSeek - 标准版，性能强大", provider: "deepseek" },
      
      // 千问 Qwen 模型
      { id: "qwen-plus", name: "Qwen-Plus (推荐)", description: "千问 - 增强版，性能与速度均衡，支持文本/图片理解", provider: "qwen" },
      { id: "qwen-max", name: "Qwen-Max (旗舰)", description: "千问 - 旗舰版，最强性能，支持复杂推理和图片理解", provider: "qwen" },
      { id: "qwen-turbo", name: "Qwen-Turbo (快速)", description: "千问 - 快速版，响应迅速，适合预处理任务", provider: "qwen" },
      { id: "qwen-vl-plus", name: "Qwen-VL-Plus (视觉增强)", description: "千问 - 多模态视觉模型，图片理解和文本生成能力更强", provider: "qwen" },
      { id: "qwen-vl-max", name: "Qwen-VL-Max (视觉旗舰)", description: "千问 - 最强视觉模型，复杂图文理解与分析", provider: "qwen" },
    ];
    
    const embeddingModels = [
      // 智谱嵌入模型
      { id: "embedding-3", name: "Embedding-3 (智谱推荐)", provider: "glm" },
      { id: "embedding-2", name: "Embedding-2 (智谱)", provider: "glm" },
      
      // DeepSeek嵌入模型
      { id: "deepseek-text-embedding-v1", name: "DeepSeek Text Embedding v1 (官方出品)", provider: "deepseek" },
      
      // 千问嵌入模型
      { id: "qwen3-vl-embedding", name: "Qwen3-VL-Embedding (多模态推荐)", provider: "qwen" },
      { id: "text-embedding-v4", name: "Text-Embedding-V4 (千问通用)", provider: "qwen" },
     ];
    
    res.json({
      success: true,
      data: {
        chatModels: availableModels,
        embeddingModels: embeddingModels,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取模型列表失败",
      error: error instanceof Error ? error.message : "未知错误",
    });
  }
});

export default router;
