import { useState, KeyboardEvent } from "react";

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
  isDarkMode?: boolean;
}

export default function ChatInput({ onSend, disabled, isDarkMode = false }: Props) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input);
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative flex items-end">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入你的问题... (Shift+Enter 换行)"
        disabled={disabled}
        className={`w-full border rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 pr-11 sm:pr-12 resize-none focus:outline-none focus:ring-2 focus:border-blue-500 disabled:opacity-50 transition-all text-sm shadow-sm ${
          isDarkMode
            ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:ring-blue-400 disabled:bg-gray-800'
            : 'bg-white border-blue-100 text-gray-900 placeholder-gray-400 focus:ring-blue-500 disabled:bg-gray-50'
        }`}
        rows={1}
        style={{ minHeight: "42px", maxHeight: "160px" }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="absolute right-1.5 sm:right-2 bottom-1.5 sm:bottom-2 w-8 h-8 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center justify-center shadow-md hover:shadow-lg"
      >
        {disabled ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        ) : (
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
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
