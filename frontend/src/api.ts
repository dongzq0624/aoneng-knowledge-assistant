// API 封装
const API_BASE = "/api";

export interface SourceReference {
  filename: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: SourceReference[];
}

// 上传文件
export async function uploadFile(file: File): Promise<{
  success: boolean;
  message: string;
  filename?: string;
  chunks?: number;
}> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "上传失败");
  }

  return response.json();
}

// 发送聊天消息（流式）
export async function* sendMessage(
  message: string,
  history: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<{
  type: string;
  content?: string;
  sources?: SourceReference[];
  error?: string;
}> {
  console.log("📤 发送消息:", message);
  console.log("📜 历史记录:", history);

  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, history }),
    signal,
  });

  console.log("📡 响应状态:", response.status);

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("无法读取响应");

  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log("✅ 读取完成，共收到", chunkCount, "个数据块");
      break;
    }

    const rawChunk = decoder.decode(value, { stream: true });
    console.log("📦 原始数据块:", rawChunk);

    buffer += rawChunk;
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          console.log("✨ 解析数据:", data);
          chunkCount++;
          yield data;
        } catch (e) {
          console.error("❌ JSON 解析失败:", e, "原始行:", line);
        }
      }
    }
  }
}
