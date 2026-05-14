// 模型设置路由
import { Router } from "express";
import fs from "fs/promises";
import path from "path";

const router = Router();

const CONFIG_FILE = path.join(process.cwd(), "model-config.json");

interface ModelConfig {
  provider: "glm" | "deepseek";
  glmApiKey: string;
  glmBaseUrl: string;
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  preprocessingModel: string;
  generationModel: string;
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
  preprocessingModel: process.env.GLM_MODEL || "glm-4-flash",
  generationModel: process.env.GLM_MODEL || "glm-4-flash",
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
    
    // 检查是否是脱敏后的值
    if (newConfig.glmApiKey && newConfig.glmApiKey.includes("...")) {
      glmApiKey = currentConfig.glmApiKey;
    }
    if (newConfig.deepseekApiKey && newConfig.deepseekApiKey.includes("...")) {
      deepseekApiKey = currentConfig.deepseekApiKey;
    }
    
    const updatedConfig: ModelConfig = {
      ...currentConfig,
      ...newConfig,
      glmApiKey,
      deepseekApiKey,
    };
    
    await saveConfig(updatedConfig);
    
    console.log("\n📝 模型配置已更新:");
    console.log(`   提供商: ${updatedConfig.provider}`);
    console.log(`   预处理模型: ${updatedConfig.preprocessingModel}`);
    console.log(`   生成回答模型: ${updatedConfig.generationModel}`);
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
      
      // DeepSeek 模型
      { id: "deepseek-v4-flash", name: "DeepSeek-V4-Flash (推荐)", description: "DeepSeek - 最新版本，快速响应，完美对应GLM-4 Flash", provider: "deepseek" },
      { id: "deepseek-v3", name: "DeepSeek-V3 (标准)", description: "DeepSeek - 标准版，性能强大", provider: "deepseek" },
    ];
    
    const embeddingModels = [
      // 智谱嵌入模型
      { id: "embedding-3", name: "Embedding-3 (智谱推荐)", provider: "glm" },
      { id: "embedding-2", name: "Embedding-2 (智谱)", provider: "glm" },
      
      // DeepSeek嵌入模型
      { id: "deepseek-text-embedding-v1", name: "DeepSeek Text Embedding v1 (官方出品)", provider: "deepseek" },
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