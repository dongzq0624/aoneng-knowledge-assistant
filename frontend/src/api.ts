const API_BASE = "/api";

export interface SourceReference {
  filename: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: SourceReference[];
  images?: string[]; // base64 图片数据，用于多模态对话展示
}

const IMAGE_DATA_PATTERN = /\[IMAGES_DATA\][\s\S]*?\[\/IMAGES_DATA\]/g;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 24000;

function sanitizeMessageContent(content: string): string {
  return content.replace(IMAGE_DATA_PATTERN, "").trim();
}

function prepareHistoryForRequest(history: ChatMessage[]): ChatMessage[] {
  const selected: ChatMessage[] = [];
  let totalChars = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const content = sanitizeMessageContent(msg.content || "");

    if (!content) {
      continue;
    }

    if (
      selected.length >= MAX_HISTORY_MESSAGES ||
      totalChars + content.length > MAX_HISTORY_CHARS
    ) {
      break;
    }

    selected.push({
      role: msg.role,
      content,
      // 发送时不传 images，避免大 base64 数据浪费 token
    });
    totalChars += content.length;
  }

  return selected.reverse();
}

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

export async function* sendMessage(
  message: string,
  history: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<{
  type: string;
  content?: string;
  sources?: SourceReference[];
  images?: string[];
  error?: string;
}> {
  const requestHistory = prepareHistoryForRequest(history);

  console.log("发送消息:", message);
  console.log("历史记录:", requestHistory);

  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, history: requestHistory }),
    signal,
  });

  console.log("响应状态:", response.status);

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("无法读取响应");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log("读取完成，共收到", chunkCount, "个数据块");
      break;
    }

    const rawChunk = decoder.decode(value, { stream: true });
    console.log("原始数据块:", rawChunk);

    buffer += rawChunk;
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) {
        continue;
      }

      try {
        const data = JSON.parse(line.slice(6));
        console.log("解析数据:", data);
        chunkCount++;
        // ragQuery yields plain strings; wrap as content chunk for consistency
        yield typeof data === "string"
          ? { type: "content", content: data }
          : data;
      } catch (error) {
        console.error("JSON 解析失败:", error, "原始行:", line);
      }
    }
  }
}
