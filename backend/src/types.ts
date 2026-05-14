// 公共类型定义

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
}

export interface UploadResponse {
  success: boolean;
  message: string;
  filename?: string;
  chunks?: number;
}

export interface DocumentChunk {
  pageContent: string;
  metadata: {
    source: string;
    filename: string;
    chunkIndex: number;
  };
}

export interface SourceReference {
  filename: string;
}