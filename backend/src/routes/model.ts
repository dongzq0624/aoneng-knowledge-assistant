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

const EMBEDDING_MODELS_BY_PROVIDER = {
  glm: ["embedding-3", "embedding-2"],
  deepseek: ["deepseek-text-embedding-v1"],
  qwen: ["text-embedding-v4"],
} as const;

function normalizeEmbeddingModel(
  provider: ModelConfig["provider"],
  embeddingModel?: string
): string {
  const supportedModels = EMBEDDING_MODELS_BY_PROVIDER[provider];
  if (embeddingModel && supportedModels.includes(embeddingModel as never)) {
    return embeddingModel;
  }
  return supportedModels[0];
}

const defaultConfig: ModelConfig = {
  provider: "glm",
  glmApiKey: process.env.GLM_API_KEY || "",
  glmBaseUrl: process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
  qwenApiKey: process.env.QWEN_API_KEY || "",
  qwenBaseUrl:
    process.env.QWEN_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  preprocessingModel: process.env.GLM_MODEL || "glm-4-flash",
  generationModel: process.env.GLM_MODEL || "glm-4-flash",
  visionModel: process.env.GLM_VISION_MODEL || "GLM-5V-Turbo",
  visionMaxTokens: 1800,
  temperature: 0.7,
  maxTokens: 2000,
  embeddingModel: process.env.GLM_EMBEDDING_MODEL || "embedding-3",
};

async function loadConfig(): Promise<ModelConfig> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(data);
    const provider = (config.provider || "glm") as ModelConfig["provider"];

    return {
      ...defaultConfig,
      ...config,
      provider,
      glmApiKey: config.glmApiKey || defaultConfig.glmApiKey,
      glmBaseUrl: config.glmBaseUrl || defaultConfig.glmBaseUrl,
      deepseekApiKey: config.deepseekApiKey || defaultConfig.deepseekApiKey,
      deepseekBaseUrl:
        config.deepseekBaseUrl || defaultConfig.deepseekBaseUrl,
      qwenApiKey: config.qwenApiKey || defaultConfig.qwenApiKey,
      qwenBaseUrl: config.qwenBaseUrl || defaultConfig.qwenBaseUrl,
      preprocessingModel:
        config.preprocessingModel ||
        config.model ||
        defaultConfig.preprocessingModel,
      generationModel:
        config.generationModel || config.model || defaultConfig.generationModel,
      visionModel: config.visionModel || defaultConfig.visionModel,
      visionMaxTokens: config.visionMaxTokens || defaultConfig.visionMaxTokens,
      embeddingModel: normalizeEmbeddingModel(
        provider,
        config.embeddingModel
      ),
    };
  } catch {
    return defaultConfig;
  }
}

async function saveConfig(config: ModelConfig): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.length <= 12) return `${apiKey.slice(0, 4)}...`;
  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
}

router.get("/config", async (req, res) => {
  try {
    const config = await loadConfig();

    res.json({
      success: true,
      data: {
        ...config,
        glmApiKey: maskApiKey(config.glmApiKey),
        deepseekApiKey: maskApiKey(config.deepseekApiKey),
        qwenApiKey: maskApiKey(config.qwenApiKey),
      },
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
    const currentConfig = await loadConfig();

    let glmApiKey = newConfig.glmApiKey || currentConfig.glmApiKey;
    let deepseekApiKey =
      newConfig.deepseekApiKey || currentConfig.deepseekApiKey;
    let qwenApiKey = newConfig.qwenApiKey || currentConfig.qwenApiKey;

    if (newConfig.glmApiKey?.includes("...")) {
      glmApiKey = currentConfig.glmApiKey;
    }
    if (newConfig.deepseekApiKey?.includes("...")) {
      deepseekApiKey = currentConfig.deepseekApiKey;
    }
    if (newConfig.qwenApiKey?.includes("...")) {
      qwenApiKey = currentConfig.qwenApiKey;
    }

    const updatedConfig: ModelConfig = {
      ...currentConfig,
      ...newConfig,
      glmApiKey,
      deepseekApiKey,
      qwenApiKey,
      embeddingModel: normalizeEmbeddingModel(
        (newConfig.provider || currentConfig.provider) as ModelConfig["provider"],
        newConfig.embeddingModel || currentConfig.embeddingModel
      ),
    };

    await saveConfig(updatedConfig);

    console.log("\n[model] 配置已更新");
    console.log(`  provider: ${updatedConfig.provider}`);
    console.log(`  preprocessingModel: ${updatedConfig.preprocessingModel}`);
    console.log(`  generationModel: ${updatedConfig.generationModel}`);
    console.log(`  visionModel: ${updatedConfig.visionModel || "未配置"}`);
    console.log(`  embeddingModel: ${updatedConfig.embeddingModel}`);
    console.log(`  temperature: ${updatedConfig.temperature}`);
    console.log(`  maxTokens: ${updatedConfig.maxTokens}\n`);

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
    const chatModels = [
      {
        id: "GLM-4.7-Flash",
        name: "GLM-4.7-Flash",
        description: "智谱快速模型，适合预处理和日常问答",
        provider: "glm",
      },
      {
        id: "GLM-4.7",
        name: "GLM-4.7",
        description: "智谱标准模型，适合通用场景",
        provider: "glm",
      },
      {
        id: "GLM-5-Turbo",
        name: "GLM-5-Turbo",
        description: "智谱增强模型，回答质量更高",
        provider: "glm",
      },
      {
        id: "GLM-5.1",
        name: "GLM-5.1",
        description: "智谱轻量模型，成本更低",
        provider: "glm",
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek-V4-Flash",
        description: "DeepSeek 快速模型，适合预处理和日常问答",
        provider: "deepseek",
      },
      {
        id: "deepseek-v3",
        name: "DeepSeek-V3",
        description: "DeepSeek 标准模型，适合复杂推理",
        provider: "deepseek",
      },
      {
        id: "qwen3.6-flash",
        name: "qwen3.6-flash",
        description: "千问增强模型，性能和速度均衡",
        provider: "qwen",
      },
      {
        id: "qwen3.5-flash",
        name: "qwen3.5-flash",
        description: "千问增强模型，性能和速度均衡",
        provider: "qwen",
      },
      {
        id: "qwen3.6-27b",
        name: "qwen3.6-27b",
        description: "千问旗舰模型，适合复杂回答生成",
        provider: "qwen",
      },
      
    ];

    const embeddingModels = [
      { id: "embedding-3", name: "Embedding-3", provider: "glm" },
      { id: "embedding-2", name: "Embedding-2", provider: "glm" },
      {
        id: "deepseek-text-embedding-v1",
        name: "DeepSeek Text Embedding v1",
        provider: "deepseek",
      },
      { id: "text-embedding-v4", name: "Text-Embedding-V4", provider: "qwen" },
    ];

    const multimodalModels = [
      {
        id: "GLM-5V-Turbo",
        name: "GLM-5V-Turbo",
        description: "智谱多模态模型，适合页面、截图和图表理解",
        provider: "glm",
      },
      {
        id: "GLM-4.6V",
        name: "GLM-4.6V",
        description: "智谱高质量多模态模型，适合复杂图文解析",
        provider: "glm",
      },
      {
        id: "GLM-4.6V-Flash",
        name: "GLM-4.6V-Flash",
        description: "智谱快速多模态模型，适合批量文档入库",
        provider: "glm",
      },
      {
        id: "DeepSeek-V4-Flash",
        name: "DeepSeek-V4-Flash",
        description: "DeepSeek 多模态快速模型，适合日常页面理解",
        provider: "deepseek",
      },
      {
        id: "DeepSeek-V4-Pro",
        name: "DeepSeek-V4-Pro",
        description: "DeepSeek 高质量多模态模型，适合复杂图文分析",
        provider: "deepseek",
      },
      {
        id: "qwen3.6-flash",
        name: "qwen3.6-flash",
        description: "千问 3.6 快速版，适合大批量页面解析",
        provider: "qwen",
      },
      {
        id: "qwen3.5-plus-2026-04-20",
        name: "qwen3.5-plus-2026-04-20",
        description: "千问 3.5 增强版，适合复杂图文理解",
        provider: "qwen",
      },
       
      {
        id: "qwen-vl-max",
        name: "qwen-vl-max",
        description: "千问旗舰视觉模型，适合复杂图表和高质量页面理解",
        provider: "qwen",
      },
    ];

    res.json({
      success: true,
      data: {
        chatModels,
        embeddingModels,
        multimodalModels,
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
