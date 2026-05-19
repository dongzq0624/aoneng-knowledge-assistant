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
    type?: "text" | "image" | "page"; // 区分文本块、图片块和整页图块
  };
  imageContent?: string; // 如果是图片块，这里存储图片的 base64 (带 MIME 前缀: data:image/png;base64,...)
}

export interface SourceReference {
  filename: string;
}
