import { useState, useEffect, useLayoutEffect, useRef } from "react";
import ChatMessage from "./components/ChatMessage";
import ChatInput from "./components/ChatInput";
import KnowledgeModal from "./components/KnowledgeModal";
import ModelSettings from "./components/ModelSettings";
import { sendMessage, type ChatMessage as Message, type SourceReference } from "./api";
import "./test-api";
import logo from "./assets/imgs/logo.webp";

// 对话数据结构
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const CONVERSATIONS_STORAGE_KEY = "allConversations";
const THEME_STORAGE_KEY = "theme";
const IMAGE_DATA_PATTERN = /\[IMAGES_DATA\][\s\S]*?\[\/IMAGES_DATA\]/g;

function stripHeavyMessageContent(content: string): string {
  return content.replace(IMAGE_DATA_PATTERN, "").trim();
}

function sanitizeMessageForStorage(
  message: Message,
  maxContentLength: number
): Message {
  const normalizedContent = stripHeavyMessageContent(message.content || "");
  const truncatedContent =
    normalizedContent.length > maxContentLength
      ? `${normalizedContent.slice(0, maxContentLength)}\n\n[内容已为本地存储截断]`
      : normalizedContent;

  return {
    role: message.role,
    content: truncatedContent,
    sources: message.sources?.slice(0, 12).map((source) => ({
      filename: source.filename,
    })),
    images: message.images,
  };
}

function buildPersistedConversations(
  conversations: Conversation[],
  maxConversations: number,
  maxMessagesPerConversation: number,
  maxContentLength: number
): Conversation[] {
  return conversations.slice(0, maxConversations).map((conversation) => ({
    ...conversation,
    messages: conversation.messages
      .slice(-maxMessagesPerConversation)
      .map((message) => sanitizeMessageForStorage(message, maxContentLength)),
  }));
}

function persistConversations(
  conversations: Conversation[]
): { persisted: boolean; degraded: boolean } {
  if (conversations.length === 0) {
    localStorage.removeItem(CONVERSATIONS_STORAGE_KEY);
    return { persisted: true, degraded: false };
  }

  const strategies = [
    { maxConversations: 20, maxMessagesPerConversation: 40, maxContentLength: 12000 },
    { maxConversations: 12, maxMessagesPerConversation: 24, maxContentLength: 8000 },
    { maxConversations: 8, maxMessagesPerConversation: 16, maxContentLength: 4000 },
    { maxConversations: 4, maxMessagesPerConversation: 12, maxContentLength: 2500 },
    { maxConversations: 1, maxMessagesPerConversation: 10, maxContentLength: 1500 },
  ];

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    const payload = buildPersistedConversations(
      conversations,
      strategy.maxConversations,
      strategy.maxMessagesPerConversation,
      strategy.maxContentLength
    );

    try {
      localStorage.setItem(
        CONVERSATIONS_STORAGE_KEY,
        JSON.stringify(payload)
      );
      return { persisted: true, degraded: i > 0 };
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") {
        throw error;
      }
    }
  }

  console.warn("localStorage quota exceeded, skip persisting conversations.");
  return { persisted: false, degraded: true };
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  // 流式回答内容（独立状态，避免每帧更新整个 conversations）
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingSources, setStreamingSources] = useState<SourceReference[]>([]);
  const [streamingImages, setStreamingImages] = useState<string[]>([]);
  const isStreamingRef = useRef(false);
  // 用 ref 追踪实时值，避免闭包陷阱（done 事件中读取不到最新 state）
  const sourcesRef = useRef<SourceReference[]>([]);
  const imagesRef = useRef<string[]>([]);

  // 获取当前对话
  const currentConversation = conversations.find(c => c.id === currentConversationId);
  const currentMessages = currentConversation?.messages || [];

  // 从 localStorage 加载所有对话和主题
  useEffect(() => {
    const saved = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
    if (saved) {
      try {
        const loaded = JSON.parse(saved);
        setConversations(loaded);
        if (loaded.length > 0 && !currentConversationId) {
          setCurrentConversationId(loaded[0].id);
        }
      } catch (e) {
        console.error("加载历史失败", e);
      }
    }
    
    // 加载主题设置
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "dark") {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  // 保存所有对话到 localStorage
  useEffect(() => {
    try {
      const result = persistConversations(conversations);
      if (result.persisted && result.degraded) {
        setStorageNotice("本地历史已自动精简，避免超出浏览器存储上限。");
      } else if (result.persisted) {
        setStorageNotice(null);
      } else {
        setStorageNotice("本地历史存储空间不足，新的完整会话仅保留在当前页面。");
      }
    } catch (error) {
      console.error("保存历史失败", error);
      setStorageNotice("本地历史保存失败，但当前会话仍可继续使用。");
    }
  }, [conversations]);

  // 自动滚动到底部（流式期间也要实时滚动，用 useLayoutEffect 避免闪烁）
  useLayoutEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [currentMessages, streamingContent]);

  // 监听屏幕尺寸变化，移动端自动收起侧边栏
  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth < 1024) {
        setShowSidebar(false);
      } else {
        setShowSidebar(true);
      }
    };

    // 初始检查
    checkScreenSize();

    // 监听窗口大小变化
    window.addEventListener("resize", checkScreenSize);

    return () => {
      window.removeEventListener("resize", checkScreenSize);
    };
  }, []);

  // 生成对话标题（取第一条用户消息前15字）
  const generateConversationTitle = (messages: Message[]): string => {
    const firstUserMsg = messages.find(m => m.role === "user");
    if (firstUserMsg) {
      const title = firstUserMsg.content.substring(0, 15);
      return title.length === 15 ? title + "..." : title;
    }
    return "新对话";
  };

  // 创建新对话
  const createNewConversation = () => {
    const newId = Date.now().toString();
    const newConversation: Conversation = {
      id: newId,
      title: "新对话",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations(prev => [newConversation, ...prev]);
    setCurrentConversationId(newId);
  };

  // 删除对话
  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) {
      const remaining = conversations.filter(c => c.id !== id);
      setCurrentConversationId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // 停止生成
  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || loadingConversationId !== null) return;

    const userMessage: Message = { role: "user", content };
    const newMessages = [...currentMessages, userMessage];

    // 捕获当前对话 ID，避免异步过程中 state 变化导致闭包问题
    const conversationId = currentConversationId;

    // 创建新对话或更新现有对话（只执行一次）
    if (!conversationId) {
      const newId = Date.now().toString();
      const newConversation: Conversation = {
        id: newId,
        title: generateConversationTitle(newMessages),
        messages: newMessages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(newId);
    } else {
      setConversations(prev => prev.map(c => {
        if (c.id === conversationId) {
          return { ...c, messages: newMessages, title: generateConversationTitle(newMessages), updatedAt: Date.now() };
        }
        return c;
      }));
    }

    setLoadingConversationId(conversationId);

    // 重置流式状态
    setStreamingContent("");
    setStreamingSources([]);
    setStreamingImages([]);
    sourcesRef.current = [];
    imagesRef.current = [];
    isStreamingRef.current = true;

    // 创建 AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let assistantContent = "";
    let finalSources: SourceReference[] = [];
    let finalImages: string[] = [];

    try {
      const stream = sendMessage(content, currentMessages, abortController.signal);

      for await (const chunk of stream) {
        if (!isStreamingRef.current) break;

        if (chunk.type === "sources") {
          const s = chunk.sources || [];
          setStreamingSources(s);
          sourcesRef.current = s;
          finalSources = s;
        } else if (chunk.type === "images") {
          // 仅记录到 ref，等回答结束后再显示（避免图片在流式期间就跳出）
          imagesRef.current = chunk.images || [];
          finalImages = imagesRef.current;
        } else if (chunk.type === "content") {
          assistantContent += chunk.content || "";
          setStreamingContent(assistantContent);
        } else if (chunk.type === "error") {
          throw new Error(chunk.error);
        } else if (chunk.type === "done") {
          isStreamingRef.current = false;
          // 回答结束后再显示图片
          setStreamingImages(imagesRef.current);
        }
      }
    } catch (error: any) {
      isStreamingRef.current = false;
      if (error?.name !== "AbortError") {
        console.error("发送消息失败:", error);
        assistantContent = `抱歉，出现错误: ${error instanceof Error ? error.message : "未知错误"}`;
        finalSources = [];
        finalImages = [];
      }
    }

    // 在 finally 之前写入 conversations，保证顺序
    const targetId = conversationId || currentConversationId;
    if (targetId && assistantContent !== undefined) {
      setConversations(prev => prev.map(c => {
        if (c.id === targetId) {
          return {
            ...c,
            messages: [...c.messages, {
              role: "assistant" as const,
              content: assistantContent,
              sources: finalSources.length > 0 ? finalSources : sourcesRef.current,
              images: finalImages.length > 0 ? finalImages : imagesRef.current,
            }],
            updatedAt: Date.now(),
          };
        }
        return c;
      }));
    }

    // 清理流式状态
    setLoadingConversationId(null);
    abortControllerRef.current = null;
    setStreamingContent("");
    setStreamingSources([]);
    setStreamingImages([]);
    sourcesRef.current = [];
    imagesRef.current = [];
  };

  const clearHistory = () => {
    if (currentConversationId) {
      const updated = conversations.map(c => {
        if (c.id === currentConversationId) {
          return { ...c, messages: [] };
        }
        return c;
      });
      setConversations(updated);
    }
  };

  // 删除单条消息
  const deleteMessage = (messageIndex: number) => {
    if (!currentConversationId) return;
    
    const updated = conversations.map(c => {
      if (c.id === currentConversationId) {
        const newMessages = c.messages.filter((_, idx) => idx !== messageIndex);
        return { ...c, messages: newMessages, updatedAt: Date.now() };
      }
      return c;
    });
    setConversations(updated);
  };
  
  // 切换主题
  const toggleTheme = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    if (newDarkMode) {
      document.documentElement.classList.add("dark");
      try {
        localStorage.setItem(THEME_STORAGE_KEY, "dark");
      } catch (error) {
        console.warn("保存主题设置失败", error);
      }
    } else {
      document.documentElement.classList.remove("dark");
      try {
        localStorage.setItem(THEME_STORAGE_KEY, "light");
      } catch (error) {
        console.warn("保存主题设置失败", error);
      }
    }
  };

  return (
    <div className={`h-screen flex transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gradient-to-br from-blue-50 via-white to-blue-50 text-gray-900'}`}>
      {/* 侧边栏遮罩层（移动端） */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ease-in-out ${
          showSidebar ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setShowSidebar(false)}
      />
      
      {/* 左侧侧边栏 */}
      {showSidebar && (
        <div className={`fixed lg:relative z-50 w-64 sm:w-72 h-full flex flex-col transition-all duration-300 ${isDarkMode ? 'bg-gray-800 border-r border-gray-700' : 'bg-gray-50 border-r border-gray-200'}`}>
          {/* Logo 区域 */}
          <div className={`p-4 border-b transition-colors duration-300 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center gap-3">
              <img src={logo} alt="知识库助手" className="w-8 sm:w-10 h-8 sm:h-10 rounded-xl shadow-md" />
              <h1 className={`text-base sm:text-lg font-bold ${isDarkMode ? 'text-white' : 'bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent'}`}>
                奥能电源知识库助手
              </h1>
              {/* 移动端关闭按钮 */}
              <button
                onClick={() => setShowSidebar(false)}
                className={`ml-auto p-2 rounded-lg lg:hidden ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <svg
                  className="w-5 h-5"
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
          </div>

          {/* 新对话按钮 */}
          <div className="p-3 sm:p-4">
            <button
              onClick={createNewConversation}
              className="w-full flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm sm:font-medium rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm hover:shadow-md"
            >
              <svg
                className="w-4 sm:w-5 h-4 sm:h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              新对话
            </button>
          </div>

          {/* 功能入口 */}
          <div className={`mx-3 mb-2 rounded-xl overflow-hidden border transition-colors ${
            isDarkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
          }`}>
            <button
              onClick={() => setShowKnowledgeModal(true)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors ${
                isDarkMode 
                  ? 'hover:bg-gray-700/50 text-gray-300 hover:text-white' 
                  : 'hover:bg-white text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                isDarkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-600'
              }`}>
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012-2v2M7 7h10" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">知识库管理</p>
                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>管理上传的文档和向量库</p>
              </div>
              <svg className={`w-4 h-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className={`h-px mx-3 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
            <button
              onClick={() => setShowModelSettings(true)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors ${
                isDarkMode 
                  ? 'hover:bg-gray-700/50 text-gray-300 hover:text-white' 
                  : 'hover:bg-white text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                isDarkMode ? 'bg-purple-900/50 text-purple-400' : 'bg-purple-100 text-purple-600'
              }`}>
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">模型设置</p>
                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>配置AI模型和API参数</p>
              </div>
              <svg className={`w-4 h-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 历史对话列表 */}
          <div className="flex-1 overflow-y-auto px-2">
            <div className={`text-xs font-semibold uppercase tracking-wider px-2 py-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>
              历史对话
            </div>
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => {
                    setCurrentConversationId(conv.id);
                    if (window.innerWidth < 1024) {
                      setShowSidebar(false);
                    }
                  }}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    conv.id === currentConversationId
                      ? isDarkMode ? "bg-gray-700 shadow-sm border border-gray-600" : "bg-white shadow-sm border border-gray-200"
                      : isDarkMode ? "hover:bg-gray-700/50 border border-transparent" : "hover:bg-white/50 border border-transparent"
                  }`}
                >
                  <div className="flex-shrink-0">
                    <svg
                      className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        conv.id === currentConversationId 
                          ? (isDarkMode ? "text-white" : "text-gray-900") 
                          : (isDarkMode ? "text-gray-300" : "text-gray-700")
                      }`}
                      title={conv.title}
                    >
                      {conv.title}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all ${isDarkMode ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/30' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部导航栏 */}
        <header className={`border-b backdrop-blur-sm shadow-sm transition-colors duration-300 ${isDarkMode ? 'bg-gray-800/80 border-gray-700' : 'bg-white/80 border-blue-100'}`}>
          <div className="px-3 sm:px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
               
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* 主题切换按钮 */}
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
                title={isDarkMode ? "切换到明亮模式" : "切换到暗夜模式"}
              >
                {isDarkMode ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {currentMessages.length > 0 && (
                <button
                  onClick={clearHistory}
                  className={`hidden sm:flex px-3 py-1.5 text-sm rounded-lg transition-colors ${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                  清空对话
                </button>
              )}
            </div>
          </div>
        </header>

        {/* 聊天区域 */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
            {storageNotice && (
              <div
                className={`mb-3 rounded-xl border px-3 py-2 text-xs sm:text-sm ${
                  isDarkMode
                    ? "border-amber-800 bg-amber-950/40 text-amber-200"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {storageNotice}
              </div>
            )}
            {currentMessages.length === 0 ? (
              <div className="text-center py-16 sm:py-20">
                <div className="w-14 sm:w-16 h-14 sm:h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <svg
                    className="w-7 sm:w-9 h-7 sm:h-9 text-white"
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
                </div>
                <h2 className={`text-lg sm:text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  你好！我是你的知识库助手
                </h2>
                <p className={`text-sm mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  上传文档后，我可以帮你回答相关问题
                </p>
                
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {currentMessages.map((msg, idx) => (
                  <ChatMessage
                    key={idx}
                    message={msg}
                    isDarkMode={isDarkMode}
                    onDelete={() => deleteMessage(idx)}
                    isStreaming={false}
                  />
                ))}
                {/* 流式输出（不写入 conversations，避免每帧触发重渲染） */}
                {isStreamingRef.current && streamingContent && (
                  <ChatMessage
                    message={{ role: "assistant", content: streamingContent, sources: streamingSources, images: streamingImages }}
                    isDarkMode={isDarkMode}
                    onDelete={() => {}}
                    isStreaming={true}
                  />
                )}
                {loadingConversationId === currentConversationId && !streamingContent && (
                  <div className="flex gap-2">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md">
                      <span className="text-xs font-bold">AI</span>
                    </div>
                    <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className={`animate-spin rounded-full h-3 w-3 border-b-2 ${isDarkMode ? 'border-blue-400' : 'border-blue-600'}`}></div>
                      <span>AI 正在思考...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* 输入框 */}
        <div className={`border-t backdrop-blur-sm transition-colors duration-300 ${isDarkMode ? 'bg-gray-800/80 border-gray-700' : 'bg-white/80 border-blue-100'}`}>
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
            <ChatInput onSend={handleSendMessage} onStop={stopGeneration} disabled={loadingConversationId !== null} isDarkMode={isDarkMode} />
          </div>
        </div>

        {/* 知识库管理弹窗 */}
        <KnowledgeModal
          isOpen={showKnowledgeModal}
          onClose={() => setShowKnowledgeModal(false)}
        />

        {/* 模型设置弹窗 */}
        <ModelSettings
          isOpen={showModelSettings}
          onClose={() => setShowModelSettings(false)}
        />
      </div>
    </div>
  );
}

export default App;
