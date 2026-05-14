import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatMessage as Message } from "../api";

interface Props {
  message: Message;
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

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md">
          <span className="text-xs font-bold">AI</span>
        </div>
      )}

      {/* 消息内容 */}
      <div
        className={`flex-1 space-y-1 ${
          isUser ? "flex flex-col items-end" : ""
        }`}
      >
        <div
          className={`inline-block max-w-[85%] ${
            isUser
              ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl px-4 py-2.5 shadow-md"
              : "bg-white text-gray-900 rounded-xl p-3 shadow-sm border border-blue-50"
          }`}
        >
          {isUser ? (
            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </div>
          ) : (
            <div className="text-sm prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
              {message.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ node, ...props }) => (
                      <div className="overflow-x-auto my-2">
                        <table
                          className="min-w-full divide-y divide-gray-300 border border-gray-300"
                          {...props}
                        />
                      </div>
                    ),
                    thead: ({ node, ...props }) => (
                      <thead className="bg-gray-50" {...props} />
                    ),
                    th: ({ node, ...props }) => (
                      <th
                        className="px-3 py-2 text-left text-xs font-semibold text-gray-900 border border-gray-300"
                        {...props}
                      />
                    ),
                    td: ({ node, ...props }) => (
                      <td
                        className="px-3 py-2 text-sm text-gray-700 border border-gray-300"
                        {...props}
                      />
                    ),
                    tr: ({ node, ...props }) => (
                      <tr className="hover:bg-gray-50" {...props} />
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

                      return inline ? (
                        <code
                          className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-xs font-mono"
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
                        className="list-disc ml-5 mb-2 space-y-1 text-gray-800"
                        {...props}
                      />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol
                        className="list-decimal ml-5 mb-2 space-y-1 text-gray-800"
                        {...props}
                      />
                    ),
                    li: ({ node, ...props }) => (
                      <li className="text-gray-800" {...props} />
                    ),
                    p: ({ node, ...props }) => (
                      <p className="mb-2 text-gray-800" {...props} />
                    ),
                    strong: ({ node, ...props }) => (
                      <strong
                        className="font-semibold text-gray-900"
                        {...props}
                      />
                    ),
                    em: ({ node, ...props }) => (
                      <em className="italic text-gray-700" {...props} />
                    ),
                    h1: ({ node, ...props }) => (
                      <h1
                        className="text-lg font-bold text-gray-900 mt-3 mb-2"
                        {...props}
                      />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2
                        className="text-base font-bold text-gray-900 mt-3 mb-2"
                        {...props}
                      />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3
                        className="text-sm font-bold text-gray-900 mt-2 mb-1"
                        {...props}
                      />
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                <span className="text-gray-400 italic">正在输入...</span>
              )}
            </div>
          )}
        </div>

        {/* 引用来源 */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className="text-xs text-blue-600">📚</span>
            {message.sources.map((source, idx) => (
              <span
                key={idx}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md transition-colors cursor-pointer border border-blue-100"
              >
                {source}
              </span>
            ))}
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
