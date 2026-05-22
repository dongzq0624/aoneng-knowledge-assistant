import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatMessage as Message, SourceReference } from "../api";

interface Props {
  message: Message;
  isDarkMode?: boolean;
  onDelete?: () => void;
  isStreaming?: boolean;
}

// 代码块组件
function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3">
      {/* 语言标签和复制按钮 */}
      <div className="flex items-center justify-between bg-gray-800 text-gray-300 px-4 py-2 rounded-t-lg text-xs">
        <span className="font-mono">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
          title="复制代码"
        >
          {copied ? (
            <>
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>已复制</span>
            </>
          ) : (
            <>
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
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      {/* 代码内容 */}
      <SyntaxHighlighter
        language={language || "text"}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: "0.5rem",
          borderBottomRightRadius: "0.5rem",
          fontSize: "0.875rem",
        }}
        showLineNumbers
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

// 格式化来源显示（只显示文件名，不显示页码）
function formatSource(source: SourceReference): string {
  return source.filename;
}

// 清理Markdown内容，移除可能的代码块包装
function cleanMarkdownContent(content: string): string {
  if (!content) return content;

  let cleaned = content;

  // 移除开头的 ```markdown 或 ``` 标记
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.substring('```markdown'.length);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring('```'.length);
  }

  // 移除结尾的 ``` 标记
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - '```'.length);
  }

  // 清理开头和结尾的空白字符
  cleaned = cleaned.trim();

  return cleaned;
}

// 图片查看器组件
function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div 
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors p-2"
        title="关闭"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// 图片组件
function ImageComponent({
  src,
  alt,
  isDarkMode,
  compact = false,
}: {
  src: string;
  alt: string;
  isDarkMode: boolean;
  compact?: boolean;
}) {
  const [showViewer, setShowViewer] = useState(false);

  return (
    <>
      <div className={compact ? "my-0" : "my-3"}>
        <div
          className={`overflow-hidden rounded-lg shadow-md ${
            compact
              ? `inline-flex h-[96px] w-[132px] items-center justify-center sm:h-[112px] sm:w-[160px] ${
                  isDarkMode
                    ? "border border-gray-700 bg-gray-800"
                    : "border border-gray-200 bg-gray-50"
                }`
              : ""
          }`}
        >
          <img
            src={src}
            alt={alt}
            className={`cursor-pointer object-contain transition-opacity hover:opacity-90 ${
              compact
                ? "h-full w-full p-1.5"
                : `max-w-full max-h-[400px] rounded-lg ${
                    isDarkMode ? "border border-gray-700" : "border border-gray-200"
                  }`
            }`}
            onClick={() => setShowViewer(true)}
            loading="lazy"
          />
        </div>
        {alt && (
          <p
            className={`mt-1 text-center text-xs ${
              compact
                ? isDarkMode
                  ? "max-w-[132px] text-gray-500 sm:max-w-[160px]"
                  : "max-w-[132px] text-gray-400 sm:max-w-[160px]"
                : isDarkMode
                ? "text-gray-400"
                : "text-gray-500"
            }`}
          >
            {alt}
          </p>
        )}
      </div>
      {showViewer && (
        <ImageViewer
          src={src}
          alt={alt}
          onClose={() => setShowViewer(false)}
        />
      )}
    </>
  );
}

export default function ChatMessage({ message, isDarkMode = false, onDelete, isStreaming = false }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  // 优先使用独立保存的图片数据，兼容旧版 content 中的标记
  let textContent = message.content;
  let images: string[] = message.images || [];
  
  if (!isUser && images.length === 0 && textContent) {
    // 兼容旧版：从 content 中解析（刷新前的老数据）
    const match = textContent.match(/\[IMAGES_DATA\](.*?)\[\/IMAGES_DATA\]/);
    if (match) {
      try {
        images = JSON.parse(match[1]);
        textContent = textContent.replace(/\[IMAGES_DATA\].*?\[\/IMAGES_DATA\]/, "");
      } catch (e) {
        console.error("解析图片数据失败", e);
      }
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("复制失败:", error);
    }
  };

  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md">
          <span className="text-xs font-bold">AI</span>
        </div>
      )}

      {/* 消息内容 */}
      <div
        className={`flex-1 space-y-1 ${
          isUser ? "flex flex-col items-end group" : "group"
        }`}
      >
        <div
          className={`inline-block max-w-[85%] sm:max-w-[80%] ${
            isUser
              ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 shadow-md"
              : isDarkMode
              ? "bg-gray-700 text-gray-100 rounded-xl p-2.5 sm:p-3 shadow-sm border border-gray-600 relative"
              : "bg-white text-gray-900 rounded-xl p-2.5 sm:p-3 shadow-sm border border-blue-50 relative"
          }`}
        >
          {isUser ? (
            <div className="text-sm  whitespace-pre-wrap break-words leading-relaxed">
              {textContent}
            </div>
          ) : (
            <div className="text-sm prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
              {textContent ? (
                <>
                  <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ node, ...props }) => (
                      <div className="overflow-x-auto my-2">
                        <table
                          className={`min-w-full divide-y border ${isDarkMode ? 'divide-gray-600 border-gray-600' : 'divide-gray-300 border-gray-300'}`}
                          {...props}
                        />
                      </div>
                    ),
                    thead: ({ node, ...props }) => (
                      <thead className={`${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`} {...props} />
                    ),
                    th: ({ node, ...props }) => (
                      <th
                        className={`px-3 py-2 text-left text-xs font-semibold border ${isDarkMode ? 'text-gray-100 border-gray-600' : 'text-gray-900 border-gray-300'}`}
                        {...props}
                      />
                    ),
                    td: ({ node, ...props }) => (
                      <td
                        className={`px-3 py-2 text-sm border ${isDarkMode ? 'text-gray-300 border-gray-600' : 'text-gray-700 border-gray-300'}`}
                        {...props}
                      />
                    ),
                    tr: ({ node, ...props }) => (
                      <tr className={`${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`} {...props} />
                    ),
                    code: ({
                      node,
                      inline,
                      className,
                      children,
                      ...props
                    }: any) => {
                      const match = /language-(\w+)/.exec(className || "");
                      const language = match ? match[1] : "";
                      const value = String(children).replace(/\n$/, "");

                      // 如果是markdown代码块，直接渲染内容而不是显示为代码
                      if (language === "markdown") {
                        return (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {value}
                          </ReactMarkdown>
                        );
                      }

                      return inline ? (
                        <code
                          className={`px-1.5 py-0.5 rounded text-xs font-mono ${isDarkMode ? 'bg-gray-800 text-red-400' : 'bg-gray-100 text-red-600'}`}
                          {...props}
                        >
                          {children}
                        </code>
                      ) : (
                        <CodeBlock language={language} value={value} />
                      );
                    },
                    ul: ({ node, ...props }) => (
                      <ul
                        className={`list-disc ml-5 mb-2 space-y-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}
                        {...props}
                      />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol
                        className={`list-decimal ml-5 mb-2 space-y-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}
                        {...props}
                      />
                    ),
                    li: ({ node, ...props }) => (
                      <li className={`${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`} {...props} />
                    ),
                    p: ({ node, ...props }) => (
                      <div
                        className={`mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}
                        {...props}
                      />
                    ),
                    strong: ({ node, ...props }) => (
                      <strong
                        className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
                        {...props}
                      />
                    ),
                    em: ({ node, ...props }) => (
                      <em className={`italic ${isDarkMode ? 'text-gray-400' : 'text-gray-700'}`} {...props} />
                    ),
                    h1: ({ node, ...props }) => (
                      <h1
                        className={`text-lg font-bold mt-3 mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
                        {...props}
                      />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2
                        className={`text-base font-bold mt-3 mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
                        {...props}
                      />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3
                        className={`text-sm font-bold mt-2 mb-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
                        {...props}
                      />
                    ),
                    img: ({ src, alt }: any) => (
                      <ImageComponent
                        src={src}
                        alt={alt || ""}
                        isDarkMode={isDarkMode}
                      />
                    ),
                  }}
                >
                  {cleanMarkdownContent(textContent)}
                </ReactMarkdown>
                {/* 渲染随文本一起返回的内联图片 */}
                {images.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-start gap-3">
                    {images.map((src, idx) => (
                      <div key={idx} className="flex-none">
                        <ImageComponent
                          src={src}
                          alt={`检索到的图片 ${idx + 1}`}
                          isDarkMode={isDarkMode}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                )}
                </>
              ) : (
                <span className={`italic ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>正在检索...</span>
              )}
            </div>
          )}
        </div>

        {/* 用户消息的操作按钮 - 显示在下方 */}
        {isUser && (
          <div className="flex items-center justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* 复制按钮 */}
            <button
              onClick={handleCopy}
              className={`p-1.5 rounded-lg transition-all ${
                isDarkMode
                  ? 'text-white/80 hover:text-white hover:bg-white/20'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
              title="复制"
            >
              {copied ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            
            {/* 删除按钮 */}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className={`p-1.5 rounded-lg transition-all ${
                  isDarkMode
                    ? 'text-white/80 hover:text-red-300 hover:bg-white/20'
                    : 'text-gray-500 hover:text-red-500 hover:bg-red-50'
                }`}
                title="删除"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* 引用来源和操作按钮 */}
        {!isUser && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {/* 操作按钮 - 放在最前面，流式输出中不显示 */}
            {!isStreaming && (
              <div className="flex items-center gap-1">
                {/* 复制按钮 */}
                <button
                  onClick={handleCopy}
                  className={`p-1 rounded-lg transition-all ${
                    isDarkMode
                      ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-600'
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                  title="复制"
                >
                  {copied ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
                
                {/* 删除按钮 */}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className={`p-1 rounded-lg transition-all ${
                      isDarkMode
                        ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/30'
                        : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                    }`}
                    title="删除"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* 引用来源 */}
            {message.sources && message.sources.length > 0 && (
              <>
                <span className={`text-xs ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>📚</span>
                {message.sources.map((source, idx) => (
                  <span
                    key={idx}
                    className={`text-xs px-2 py-0.5 rounded-md transition-colors cursor-pointer border ${
                      isDarkMode
                        ? 'bg-gray-800 hover:bg-gray-700 text-blue-400 border-gray-700'
                        : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-100'
                    }`}
                  >
                    {formatSource(source)}
                  </span>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br from-gray-500 to-gray-600 text-white shadow-md">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
