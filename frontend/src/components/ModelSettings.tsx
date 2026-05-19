import { useState, useEffect } from "react";

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

interface ModelSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ModelSettings({ isOpen, onClose }: ModelSettingsProps) {
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
    temperature: 0.7,
    maxTokens: 2000,
    embeddingModel: "embedding-3",
  });
  
  const [chatModels, setChatModels] = useState<ChatModelOption[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<EmbeddingModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showApiKeys, setShowApiKeys] = useState<{ glm: boolean; deepseek: boolean; qwen: boolean }>({
    glm: false,
    deepseek: false,
    qwen: false,
  });

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      fetchModels();
    }
  }, [isOpen]);

  async function fetchConfig() {
    try {
      setLoading(true);
      const response = await fetch("/api/model/config");
      const data = await response.json();
      
      if (data.success) {
        if (data.data.model || data.data.preprocessingModel) {
          setConfig({
            provider: data.data.provider || "glm",
            glmApiKey: data.data.glmApiKey || "",
            glmBaseUrl: data.data.glmBaseUrl || "https://open.bigmodel.cn/api/paas/v4",
            deepseekApiKey: data.data.deepseekApiKey || "",
            deepseekBaseUrl: data.data.deepseekBaseUrl || "https://api.deepseek.com/v1",
            qwenApiKey: data.data.qwenApiKey || "",
            qwenBaseUrl: data.data.qwenBaseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1",
            preprocessingModel: data.data.preprocessingModel || data.data.model || "glm-4-flash",
            generationModel: data.data.generationModel || data.data.model || "glm-4-flash",
            temperature: data.data.temperature || 0.7,
            maxTokens: data.data.maxTokens || 2000,
            embeddingModel: data.data.embeddingModel || "embedding-3",
          });
        } else {
          setConfig(data.data);
        }
      }
    } catch (error) {
      console.error("获取配置失败:", error);
      setMessage({ type: 'error', text: "获取配置失败" });
    } finally {
      setLoading(false);
    }
  }

  async function fetchModels() {
    try {
      const response = await fetch("/api/model/models");
      const data = await response.json();
      
      if (data.success) {
        setChatModels(data.data.chatModels);
        setEmbeddingModels(data.data.embeddingModels);
      }
    } catch (error) {
      console.error("获取模型列表失败:", error);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setMessage(null);
      
      // 验证必填字段
      if (!config[`${config.provider}ApiKey` as keyof ModelConfig]) {
        const providerNames: Record<string, string> = { glm: "智谱GLM", deepseek: "DeepSeek", qwen: "千问Qwen" };
        setMessage({ type: 'error', text: `请输入${providerNames[config.provider]}的 API Key` });
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
        setMessage({ type: 'success', text: "✅ 配置已保存成功！请重启后端服务以应用新配置" });
        
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setMessage({ type: 'error', text: data.message || "保存失败" });
      }
    } catch (error) {
      console.error("保存配置失败:", error);
      setMessage({ type: 'error', text: "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  // 根据当前提供商过滤模型
  const filteredModels = chatModels.filter(model => model.provider === config.provider);
  
  // 根据当前提供商过滤嵌入模型
  const filteredEmbeddingModels = embeddingModels.filter(model => model.provider === config.provider);

  function handleProviderChange(provider: "glm" | "deepseek" | "qwen") {
    const providerModels = chatModels.filter(m => m.provider === provider);
    const providerEmbeddingModels = embeddingModels.filter(m => m.provider === provider);
    
    const firstModel = providerModels[0];
    const firstEmbeddingModel = providerEmbeddingModels[0];
    
    const defaultModels: Record<string, { chat: string; embedding: string }> = {
      glm: { chat: "glm-4-flash", embedding: "embedding-3" },
      deepseek: { chat: "deepseek-v4-flash", embedding: "deepseek-text-embedding-v1" },
      qwen: { chat: "qwen-plus", embedding: "text-embedding-v4" },
    };
    
    setConfig({
      ...config,
      provider,
      preprocessingModel: firstModel?.id || defaultModels[provider].chat,
      generationModel: firstModel?.id || defaultModels[provider].chat,
      embeddingModel: firstEmbeddingModel?.id || defaultModels[provider].embedding,
    });
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            模型参数设置
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600 dark:text-gray-300">加载中...</span>
            </div>
          ) : (
            <>
              {/* 提供商选择 */}
              <div className="space-y-3 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <label className="block text-sm font-semibold text-purple-800 dark:text-purple-300 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  选择模型提供商
                </label>
                
                <div className="grid grid-cols-3 gap-3">
                  {/* 智谱 GLM */}
                  <button
                    onClick={() => handleProviderChange("glm")}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      config.provider === "glm"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-md"
                        : "border-gray-300 dark:border-gray-600 hover:border-blue-300"
                    }`}
                  >
                    <div className="text-center">
                      <div className={`text-lg font-bold mb-1 ${config.provider === "glm" ? "text-blue-600" : "text-gray-700 dark:text-gray-300"}`}>
                        智谱 GLM
                      </div>
                      <div className={`text-xs ${config.provider === "glm" ? "text-blue-500" : "text-gray-500"}`}>
                        国产大模型
                      </div>
                      {config.provider === "glm" && (
                        <svg className="w-5 h-5 mx-auto mt-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* DeepSeek */}
                  <button
                    onClick={() => handleProviderChange("deepseek")}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      config.provider === "deepseek"
                        ? "border-green-500 bg-green-50 dark:bg-green-900/30 shadow-md"
                        : "border-gray-300 dark:border-gray-600 hover:border-green-300"
                    }`}
                  >
                    <div className="text-center">
                      <div className={`text-lg font-bold mb-1 ${config.provider === "deepseek" ? "text-green-600" : "text-gray-700 dark:text-gray-300"}`}>
                        DeepSeek
                      </div>
                      <div className={`text-xs ${config.provider === "deepseek" ? "text-green-500" : "text-gray-500"}`}>
                        高性能推理
                      </div>
                      {config.provider === "deepseek" && (
                        <svg className="w-5 h-5 mx-auto mt-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* 千问 Qwen */}
                  <button
                    onClick={() => handleProviderChange("qwen")}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      config.provider === "qwen"
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 shadow-md"
                        : "border-gray-300 dark:border-gray-600 hover:border-purple-300"
                    }`}
                  >
                    <div className="text-center">
                      <div className={`text-lg font-bold mb-1 ${config.provider === "qwen" ? "text-purple-600" : "text-gray-700 dark:text-gray-300"}`}>
                        千问 Qwen
                      </div>
                      <div className={`text-xs ${config.provider === "qwen" ? "text-purple-500" : "text-gray-500"}`}>
                        多模态理解
                      </div>
                      {config.provider === "qwen" && (
                        <svg className="w-5 h-5 mx-auto mt-2 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* API Key 配置 */}
              <div className="space-y-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <label className="block text-sm font-semibold text-red-800 dark:text-red-300 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  {config.provider === "glm" ? "智谱 GLM API 密钥" : config.provider === "qwen" ? "千问 Qwen API 密钥" : "DeepSeek API 密钥"}（必填）
                </label>

                {/* 根据提供商显示对应的 API Key 输入框 */}
                {config.provider === "glm" && (
                  <div className="space-y-2 p-3 bg-white dark:bg-gray-700 rounded-md border border-blue-200 dark:border-blue-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                        智谱 GLM API Key
                      </span>
                      <button
                        onClick={() => setShowApiKeys({ ...showApiKeys, glm: !showApiKeys.glm })}
                        className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                      >
                        {showApiKeys.glm ? "隐藏" : "显示"}
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      <input
                        type={showApiKeys.glm ? "text" : "password"}
                        placeholder="请输入智谱 GLM API Key"
                        value={config.glmApiKey}
                        onChange={(e) => setConfig({ ...config, glmApiKey: e.target.value })}
                        className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-sm"
                      />
                      
                      <input
                        type="text"
                        placeholder="Base URL (默认: https://open.bigmodel.cn/api/paas/v4)"
                        value={config.glmBaseUrl}
                        onChange={(e) => setConfig({ ...config, glmBaseUrl: e.target.value })}
                        className="w-full px-3 py-2 border border-blue-200 dark:border-blue-500 rounded-md focus:ring-2 focus:ring-blue-400 bg-white dark:bg-gray-800 text-xs"
                      />
                    </div>
                  </div>
                )}

                {config.provider === "deepseek" && (
                  <div className="space-y-2 p-3 bg-white dark:bg-gray-700 rounded-md border border-green-200 dark:border-green-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                        DeepSeek API Key
                      </span>
                      <button
                        onClick={() => setShowApiKeys({ ...showApiKeys, deepseek: !showApiKeys.deepseek })}
                        className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
                      >
                        {showApiKeys.deepseek ? "隐藏" : "显示"}
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      <input
                        type={showApiKeys.deepseek ? "text" : "password"}
                        placeholder="请输入 DeepSeek API Key"
                        value={config.deepseekApiKey}
                        onChange={(e) => setConfig({ ...config, deepseekApiKey: e.target.value })}
                        className="w-full px-3 py-2 border border-green-300 dark:border-green-600 rounded-md focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-800 text-sm"
                      />
                      
                      <input
                        type="text"
                        placeholder="Base URL (默认: https://api.deepseek.com/v1)"
                        value={config.deepseekBaseUrl}
                        onChange={(e) => setConfig({ ...config, deepseekBaseUrl: e.target.value })}
                        className="w-full px-3 py-2 border border-green-200 dark:border-green-500 rounded-md focus:ring-2 focus:ring-green-400 bg-white dark:bg-gray-800 text-xs"
                      />
                    </div>
                  </div>
                )}

                {config.provider === "qwen" && (
                  <div className="space-y-2 p-3 bg-white dark:bg-gray-700 rounded-md border border-purple-200 dark:border-purple-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-purple-700 dark:text-purple-300 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-purple-500 rounded-full"></span>
                        千问 Qwen API Key
                      </span>
                      <button
                        onClick={() => setShowApiKeys({ ...showApiKeys, qwen: !showApiKeys.qwen })}
                        className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
                      >
                        {showApiKeys.qwen ? "隐藏" : "显示"}
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      <input
                        type={showApiKeys.qwen ? "text" : "password"}
                        placeholder="请输入千问 Qwen API Key (DashScope)"
                        value={config.qwenApiKey}
                        onChange={(e) => setConfig({ ...config, qwenApiKey: e.target.value })}
                        className="w-full px-3 py-2 border border-purple-300 dark:border-purple-600 rounded-md focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-800 text-sm"
                      />
                      
                      <input
                        type="text"
                        placeholder="Base URL (默认: https://dashscope.aliyuncs.com/compatible-mode/v1)"
                        value={config.qwenBaseUrl}
                        onChange={(e) => setConfig({ ...config, qwenBaseUrl: e.target.value })}
                        className="w-full px-3 py-2 border border-purple-200 dark:border-purple-500 rounded-md focus:ring-2 focus:ring-purple-400 bg-white dark:bg-gray-800 text-xs"
                      />
                    </div>
                  </div>
                )}

                <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  {config.provider === "glm" ? "请填写智谱GLM的 API Key" : config.provider === "qwen" ? "请填写千问Qwen的 API Key (DashScope)" : "请填写DeepSeek的 API Key"}。保存后需重启后端服务生效。
                </p>
              </div>

              {/* 模型选择 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 预处理模型 */}
                <div className="space-y-2 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    预处理模型
                  </label>
                  <select
                    value={config.preprocessingModel}
                    onChange={(e) => setConfig({ ...config, preprocessingModel: e.target.value })}
                    className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {filteredModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    {filteredModels.find(m => m.id === config.preprocessingModel)?.description || "用于关键词提取、查询改写"}
                  </p>
                </div>

                {/* 生成回答模型 */}
                <div className="space-y-2 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <label className="block text-sm font-medium text-green-800 dark:text-green-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    生成回答模型
                  </label>
                  <select
                    value={config.generationModel}
                    onChange={(e) => setConfig({ ...config, generationModel: e.target.value })}
                    className="w-full px-3 py-2 border border-green-300 dark:border-green-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {filteredModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                    {filteredModels.find(m => m.id === config.generationModel)?.description || "用于最终回答生成"}
                  </p>
                </div>
              </div>

              {/* 嵌入模型 */}
              <div className={`space-y-2 p-4 rounded-lg border ${
                config.provider === "glm" 
                  ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" 
                  : config.provider === "qwen"
                  ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800"
                  : "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
              }`}>
                <label className={`block text-sm font-medium mb-2 flex items-center gap-2 ${
                  config.provider === "glm" ? "text-purple-800 dark:text-purple-300" 
                  : config.provider === "qwen" ? "text-indigo-800 dark:text-indigo-300"
                  : "text-orange-800 dark:text-orange-300"
                }`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  嵌入模型（用于文档向量化）
                </label>
                <select
                  value={config.embeddingModel}
                  onChange={(e) => setConfig({ ...config, embeddingModel: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm ${
                    config.provider === "glm"
                      ? "border-purple-300 dark:border-purple-600 focus:ring-purple-500"
                      : config.provider === "qwen"
                      ? "border-indigo-300 dark:border-indigo-600 focus:ring-indigo-500"
                      : "border-orange-300 dark:border-orange-600 focus:ring-orange-500"
                  }`}
                >
                  {filteredEmbeddingModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <p className={`mt-1 text-xs ${
                  config.provider === "glm" ? "text-purple-600 dark:text-purple-400" 
                  : config.provider === "qwen" ? "text-indigo-600 dark:text-indigo-400"
                  : "text-orange-600 dark:text-orange-400"
                }`}>
                  {filteredEmbeddingModels.find(m => m.id === config.embeddingModel)?.name || "选择文档向量化模型"}
                </p>
              </div>

              {/* 温度和Token数 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 温度 */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    温度 (Temperature): <span className="font-bold text-blue-600">{config.temperature}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>精确 (0)</span>
                    <span>创造 (1)</span>
                  </div>
                </div>

                {/* 最大Token数 */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    最大Token数: <span className="font-bold text-green-600">{config.maxTokens}</span>
                  </label>
                  <input
                    type="range"
                    min="256"
                    max="4096"
                    step="128"
                    value={config.maxTokens}
                    onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>256</span>
                    <span>4096</span>
                  </div>
                </div>
              </div>

              {/* 使用建议 */}
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">使用建议</p>
                    <ul className="mt-1 text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
                      <li>• 智谱 GLM：国产模型，中文理解能力强，适合通用场景</li>
                      <li>• DeepSeek：高性能推理模型，适合复杂问题分析和代码生成</li>
                      <li>• 千问 Qwen：阿里多模态模型，支持图片理解和文本生成，VL模型视觉能力突出</li>
                      <li>• 预处理模型建议使用快速版本以提高响应速度</li>
                      <li>• 修改 API Key 后需要重启后端服务才能生效</li>
                    </ul>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`p-4 rounded-lg ${
                  message.type === 'success' 
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' 
                    : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                }`}>
                  {message.text}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t dark:border-gray-700">
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {saving && (
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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