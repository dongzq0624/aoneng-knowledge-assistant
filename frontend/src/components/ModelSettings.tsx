import { useEffect, useState } from "react";

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
  visionModel: string;
  visionMaxTokens?: number;
  temperature: number;
  maxTokens: number;
  embeddingModel: string;
}

interface ChatModelOption {
  id: string;
  name: string;
  description: string;
  provider: "glm" | "deepseek" | "qwen";
}

interface EmbeddingModelOption {
  id: string;
  name: string;
  provider: "glm" | "deepseek" | "qwen";
}

interface MultimodalModelOption {
  id: string;
  name: string;
  description: string;
  provider: "glm" | "deepseek" | "qwen";
}

interface ModelSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const providerNames: Record<ModelConfig["provider"], string> = {
  glm: "智谱 GLM",
  deepseek: "DeepSeek",
  qwen: "千问 Qwen",
};

const defaultModels: Record<
  ModelConfig["provider"],
  { chat: string; embedding: string; vision: string }
> = {
  glm: {
    chat: "glm-4-flash",
    embedding: "embedding-3",
    vision: "GLM-5V-Turbo",
  },
  deepseek: {
    chat: "deepseek-v4-flash",
    embedding: "deepseek-text-embedding-v1",
    vision: "DeepSeek-V4-Flash",
  },
  qwen: {
    chat: "qwen-plus",
    embedding: "text-embedding-v4",
    vision: "Qwen3.6-Plus",
  },
};

export default function ModelSettings({
  isOpen,
  onClose,
}: ModelSettingsProps) {
  const [config, setConfig] = useState<ModelConfig>({
    provider: "glm",
    glmApiKey: "",
    glmBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    deepseekApiKey: "",
    deepseekBaseUrl: "https://api.deepseek.com/v1",
    qwenApiKey: "",
    qwenBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    preprocessingModel: "glm-4-flash",
    generationModel: "glm-4-flash",
    visionModel: "GLM-5V-Turbo",
    visionMaxTokens: 1800,
    temperature: 0.7,
    maxTokens: 2000,
    embeddingModel: "embedding-3",
  });

  const [chatModels, setChatModels] = useState<ChatModelOption[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<EmbeddingModelOption[]>(
    []
  );
  const [multimodalModels, setMultimodalModels] = useState<
    MultimodalModelOption[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showApiKeys, setShowApiKeys] = useState({
    glm: false,
    deepseek: false,
    qwen: false,
  });

  useEffect(() => {
    if (isOpen) {
      void fetchConfig();
      void fetchModels();
    }
  }, [isOpen]);

  async function fetchConfig() {
    try {
      setLoading(true);
      const response = await fetch("/api/model/config");
      const data = await response.json();

      if (data.success) {
        const provider = (data.data.provider || "glm") as ModelConfig["provider"];
        setConfig({
          provider,
          glmApiKey: data.data.glmApiKey || "",
          glmBaseUrl:
            data.data.glmBaseUrl || "https://open.bigmodel.cn/api/paas/v4",
          deepseekApiKey: data.data.deepseekApiKey || "",
          deepseekBaseUrl:
            data.data.deepseekBaseUrl || "https://api.deepseek.com/v1",
          qwenApiKey: data.data.qwenApiKey || "",
          qwenBaseUrl:
            data.data.qwenBaseUrl ||
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
          preprocessingModel:
            data.data.preprocessingModel ||
            data.data.model ||
            "glm-4-flash",
          generationModel:
            data.data.generationModel || data.data.model || "glm-4-flash",
          visionModel: data.data.visionModel || defaultModels[provider].vision,
          visionMaxTokens: data.data.visionMaxTokens || 1800,
          temperature: data.data.temperature || 0.7,
          maxTokens: data.data.maxTokens || 2000,
          embeddingModel: data.data.embeddingModel || "embedding-3",
        });
      }
    } catch (error) {
      console.error("获取配置失败:", error);
      setMessage({ type: "error", text: "获取配置失败" });
    } finally {
      setLoading(false);
    }
  }

  async function fetchModels() {
    try {
      const response = await fetch("/api/model/models");
      const data = await response.json();

      if (data.success) {
        setChatModels(data.data.chatModels || []);
        setEmbeddingModels(data.data.embeddingModels || []);
        setMultimodalModels(data.data.multimodalModels || []);
      }
    } catch (error) {
      console.error("获取模型列表失败:", error);
    }
  }

  const filteredChatModels = chatModels.filter(
    (model) => model.provider === config.provider
  );
  const filteredEmbeddingModels = embeddingModels.filter(
    (model) => model.provider === config.provider
  );
  const filteredMultimodalModels = multimodalModels.filter(
    (model) => model.provider === config.provider
  );
  const supportsMultimodal = filteredMultimodalModels.length > 0;

  function handleProviderChange(provider: ModelConfig["provider"]) {
    const providerChatModels = chatModels.filter(
      (model) => model.provider === provider
    );
    const providerEmbeddingModels = embeddingModels.filter(
      (model) => model.provider === provider
    );
    const providerMultimodalModels = multimodalModels.filter(
      (model) => model.provider === provider
    );

    setConfig((prev) => ({
      ...prev,
      provider,
      preprocessingModel:
        providerChatModels[0]?.id || defaultModels[provider].chat,
      generationModel: providerChatModels[0]?.id || defaultModels[provider].chat,
      embeddingModel:
        providerEmbeddingModels[0]?.id || defaultModels[provider].embedding,
      visionModel:
        providerMultimodalModels[0]?.id || defaultModels[provider].vision,
    }));
  }

  async function handleSave() {
    try {
      setSaving(true);
      setMessage(null);

      const apiKeyField = `${config.provider}ApiKey` as const;
      if (!config[apiKeyField]) {
        setMessage({
          type: "error",
          text: `请输入${providerNames[config.provider]}的 API Key`,
        });
        return;
      }

      if (supportsMultimodal && !config.visionModel) {
        setMessage({
          type: "error",
          text: "请选择多模态模型",
        });
        return;
      }

      const response = await fetch("/api/model/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          type: "success",
          text: "配置已保存成功，请重启后端服务以应用新配置",
        });

        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setMessage({ type: "error", text: data.message || "保存失败" });
      }
    } catch (error) {
      console.error("保存配置失败:", error);
      setMessage({ type: "error", text: "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b p-6 dark:border-gray-700">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
            <svg
              className="h-6 w-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            模型参数设置
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-6 p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600 dark:text-gray-300">
                加载中...
              </span>
            </div>
          ) : (
            <>
              <div className="space-y-3 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 dark:border-purple-800 dark:from-purple-900/20 dark:to-indigo-900/20">
                <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-800 dark:text-purple-300">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  选择模型提供商
                </label>

                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ["glm", "智谱 GLM", "国产大模型"],
                      ["deepseek", "DeepSeek", "高性能推理"],
                      ["qwen", "千问 Qwen", "多模态理解"],
                    ] as const
                  ).map(([provider, title, subtitle]) => {
                    const active = config.provider === provider;
                    const activeClass =
                      provider === "glm"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                        : provider === "deepseek"
                        ? "border-green-500 bg-green-50 dark:bg-green-900/30"
                        : "border-purple-500 bg-purple-50 dark:bg-purple-900/30";
                    const hoverClass =
                      provider === "glm"
                        ? "hover:border-blue-300"
                        : provider === "deepseek"
                        ? "hover:border-green-300"
                        : "hover:border-purple-300";
                    const titleClass =
                      provider === "glm"
                        ? "text-blue-600"
                        : provider === "deepseek"
                        ? "text-green-600"
                        : "text-purple-600";

                    return (
                      <button
                        key={provider}
                        onClick={() => handleProviderChange(provider)}
                        className={`rounded-lg border-2 p-4 transition-all ${
                          active
                            ? `${activeClass} shadow-md`
                            : `border-gray-300 dark:border-gray-600 ${hoverClass}`
                        }`}
                      >
                        <div className="text-center">
                          <div
                            className={`mb-1 text-lg font-bold ${
                              active
                                ? titleClass
                                : "text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {title}
                          </div>
                          <div
                            className={`text-xs ${
                              active ? titleClass : "text-gray-500"
                            }`}
                          >
                            {subtitle}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                  {providerNames[config.provider]} API Key（必填）
                </label>

                {config.provider === "glm" && (
                  <div className="space-y-2 rounded-md border border-blue-200 bg-white p-3 dark:border-blue-700 dark:bg-gray-700">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-sm font-medium text-blue-700 dark:text-blue-300">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-500"></span>
                        智谱 GLM API Key
                      </span>
                      <button
                        onClick={() =>
                          setShowApiKeys((prev) => ({
                            ...prev,
                            glm: !prev.glm,
                          }))
                        }
                        className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
                      >
                        {showApiKeys.glm ? "隐藏" : "显示"}
                      </button>
                    </div>
                    <input
                      type={showApiKeys.glm ? "text" : "password"}
                      placeholder="请输入智谱 GLM API Key"
                      value={config.glmApiKey}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          glmApiKey: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-blue-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:border-blue-600 dark:bg-gray-800"
                    />
                    <input
                      type="text"
                      placeholder="Base URL"
                      value={config.glmBaseUrl}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          glmBaseUrl: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-blue-400 dark:border-blue-500 dark:bg-gray-800"
                    />
                  </div>
                )}

                {config.provider === "deepseek" && (
                  <div className="space-y-2 rounded-md border border-green-200 bg-white p-3 dark:border-green-700 dark:bg-gray-700">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-sm font-medium text-green-700 dark:text-green-300">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500"></span>
                        DeepSeek API Key
                      </span>
                      <button
                        onClick={() =>
                          setShowApiKeys((prev) => ({
                            ...prev,
                            deepseek: !prev.deepseek,
                          }))
                        }
                        className="rounded bg-green-100 px-2 py-1 text-xs text-green-700 transition-colors hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800"
                      >
                        {showApiKeys.deepseek ? "隐藏" : "显示"}
                      </button>
                    </div>
                    <input
                      type={showApiKeys.deepseek ? "text" : "password"}
                      placeholder="请输入 DeepSeek API Key"
                      value={config.deepseekApiKey}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          deepseekApiKey: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-green-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 dark:border-green-600 dark:bg-gray-800"
                    />
                    <input
                      type="text"
                      placeholder="Base URL"
                      value={config.deepseekBaseUrl}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          deepseekBaseUrl: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-green-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-green-400 dark:border-green-500 dark:bg-gray-800"
                    />
                  </div>
                )}

                {config.provider === "qwen" && (
                  <div className="space-y-2 rounded-md border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-gray-700">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-sm font-medium text-purple-700 dark:text-purple-300">
                        <span className="inline-block h-2 w-2 rounded-full bg-purple-500"></span>
                        千问 Qwen API Key
                      </span>
                      <button
                        onClick={() =>
                          setShowApiKeys((prev) => ({
                            ...prev,
                            qwen: !prev.qwen,
                          }))
                        }
                        className="rounded bg-purple-100 px-2 py-1 text-xs text-purple-700 transition-colors hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:hover:bg-purple-800"
                      >
                        {showApiKeys.qwen ? "隐藏" : "显示"}
                      </button>
                    </div>
                    <input
                      type={showApiKeys.qwen ? "text" : "password"}
                      placeholder="请输入千问 Qwen API Key"
                      value={config.qwenApiKey}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          qwenApiKey: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-purple-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 dark:border-purple-600 dark:bg-gray-800"
                    />
                    <input
                      type="text"
                      placeholder="Base URL"
                      value={config.qwenBaseUrl}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          qwenBaseUrl: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-purple-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-purple-400 dark:border-purple-500 dark:bg-gray-800"
                    />
                  </div>
                )}

                <p className="flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
                  <svg
                    className="mt-0.5 h-4 w-4 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  保存后需要重启后端服务才会生效。
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-300">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    预处理模型
                  </label>
                  <select
                    value={config.preprocessingModel}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        preprocessingModel: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-blue-600 dark:bg-gray-700 dark:text-white"
                  >
                    {filteredChatModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    {filteredChatModels.find(
                      (model) => model.id === config.preprocessingModel
                    )?.description || "用于关键词提取和查询改写"}
                  </p>
                </div>

                <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-300">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                    生成回答模型
                  </label>
                  <select
                    value={config.generationModel}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        generationModel: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-green-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-green-500 dark:border-green-600 dark:bg-gray-700 dark:text-white"
                  >
                    {filteredChatModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                    {filteredChatModels.find(
                      (model) => model.id === config.generationModel
                    )?.description || "用于最终回答生成"}
                  </p>
                </div>
              </div>

              <div
                className={`space-y-2 rounded-lg border p-4 ${
                  config.provider === "glm"
                    ? "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20"
                    : config.provider === "qwen"
                    ? "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-900/20"
                    : "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20"
                }`}
              >
                <label
                  className={`mb-2 flex items-center gap-2 text-sm font-medium ${
                    config.provider === "glm"
                      ? "text-purple-800 dark:text-purple-300"
                      : config.provider === "qwen"
                      ? "text-indigo-800 dark:text-indigo-300"
                      : "text-orange-800 dark:text-orange-300"
                  }`}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  嵌入模型（用于文档向量化）
                </label>
                <select
                  value={config.embeddingModel}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      embeddingModel: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-current/20 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 dark:bg-gray-700 dark:text-white"
                >
                  {filteredEmbeddingModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <p
                  className={`mt-1 text-xs ${
                    config.provider === "glm"
                      ? "text-purple-600 dark:text-purple-400"
                      : config.provider === "qwen"
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-orange-600 dark:text-orange-400"
                  }`}
                >
                  该模型用于文档入库时的向量化以及查询检索时的相似度计算。
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-800 dark:bg-cyan-900/20">
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-800 dark:text-cyan-300">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 4h4a2 2 0 002-2V8a2 2 0 00-2-2H9a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  多模态模型（用于文档页面解析）
                </label>

                {supportsMultimodal ? (
                  <>
                    <select
                      value={config.visionModel}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          visionModel: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-cyan-500 dark:border-cyan-600 dark:bg-gray-700 dark:text-white"
                    >
                      {filteredMultimodalModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-cyan-700 dark:text-cyan-400">
                      {filteredMultimodalModels.find(
                        (model) => model.id === config.visionModel
                      )?.description ||
                        "用于 PDF、DOCX、截图、图表等页面级图文理解。"}
                    </p>
                  </>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    当前提供商暂无可用多模态模型，请检查模型列表是否加载成功，或重新选择支持多模态的提供商。
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    温度 (Temperature):
                    <span className="ml-1 font-bold text-blue-600">
                      {config.temperature}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        temperature: parseFloat(e.target.value),
                      }))
                    }
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>精确 (0)</span>
                    <span>发散 (1)</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    最大 Token 数:
                    <span className="ml-1 font-bold text-green-600">
                      {config.maxTokens}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="256"
                    max="4096"
                    step="128"
                    value={config.maxTokens}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        maxTokens: parseInt(e.target.value, 10),
                      }))
                    }
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>256</span>
                    <span>4096</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
                <div className="flex items-start gap-2">
                  <svg
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                      使用建议
                    </p>
                    <ul className="mt-1 space-y-1 text-xs text-yellow-700 dark:text-yellow-400">
                      <li>GLM 适合中文通用场景，Qwen 的页面视觉理解更丰富。</li>
                      <li>预处理模型建议选择速度快的模型，生成模型再选择质量更高的模型。</li>
                      <li>多模态模型只影响文档上传阶段的页面解析，不影响普通文本问答的主回答模型。</li>
                      <li>如果修改了 API Key 或模型配置，请重启后端服务再测试。</li>
                    </ul>
                  </div>
                </div>
              </div>

              {message && (
                <div
                  className={`rounded-lg p-4 ${
                    message.type === "success"
                      ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200"
                      : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"
                  }`}
                >
                  {message.text}
                </div>
              )}

              <div className="flex justify-end space-x-3 border-t pt-4 dark:border-gray-700">
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && (
                    <svg
                      className="-ml-1 mr-2 h-4 w-4 animate-spin text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  )}
                  保存设置并重启
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
