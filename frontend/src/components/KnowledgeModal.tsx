import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { uploadFile } from "../api";

interface Document {
  filename: string;
  chunks: number;
}

interface VectorRecord {
  filename: string;
  chunkIndex: number;
  text: string;
  vectorDimension: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function KnowledgeModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"list" | "upload" | "vectors">("list");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [vectors, setVectors] = useState<VectorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [vectorsLoading, setVectorsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expandedChunk, setExpandedChunk] = useState<number | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // 加载文档列表
  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge");
      const data = await response.json();
      if (data.success) {
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error("加载文档列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 加载向量数据
  const loadVectors = async () => {
    setVectorsLoading(true);
    try {
      const response = await fetch("/api/knowledge/vectors");
      const data = await response.json();
      if (data.success) {
        setVectors(data.vectors);
      }
    } catch (error) {
      console.error("加载向量数据失败:", error);
    } finally {
      setVectorsLoading(false);
    }
  };

  // 删除文档
  const handleDelete = async (filename: string) => {
    if (!confirm(`确定要删除"${filename}"吗？`)) return;

    try {
      const response = await fetch(
        `/api/knowledge/${encodeURIComponent(filename)}`,
        {
          method: "DELETE",
        }
      );
      const data = await response.json();
      if (data.success) {
        setMessage({ type: "success", text: `✅ 已删除 ${filename}` });
        loadDocuments();
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: `❌ 删除失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
      });
    }
  };

  // 批量删除所有文档
  const handleDeleteAll = async () => {
    if (documents.length === 0) return;

    if (
      !confirm(`确定要删除所有 ${documents.length} 个文档吗？此操作不可恢复！`)
    )
      return;

    setLoading(true);
    try {
      const response = await fetch("/api/knowledge", {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: `✅ 已删除所有文档，共 ${data.count} 个文档块`,
        });
        loadDocuments();
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: `❌ 批量删除失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
      });
    } finally {
      setLoading(false);
    }
  };

  // 上传文件
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);
    setMessage(null);

    try {
      const result = await uploadFile(file);
      setMessage({
        type: "success",
        text: `✅ ${result.filename} 上传成功！已处理 ${result.chunks} 个文档块`,
      });
      loadDocuments();
      setTimeout(() => {
        setMessage(null);
        setActiveTab("list");
      }, 2000);
    } catch (error) {
      setMessage({
        type: "error",
        text: `❌ 上传失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
      });
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
      "text/markdown": [".md"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  // 打开时加载数据
  useEffect(() => {
    if (isOpen) {
      loadDocuments();
      if (activeTab === "vectors") {
        loadVectors();
      }
    }
  }, [isOpen]);

  // 切换到向量库标签时加载数据
  useEffect(() => {
    if (isOpen && activeTab === "vectors") {
      loadVectors();
    }
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">知识库管理</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
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

        {/* 标签页 */}
        <div className="flex border-b border-gray-200 px-6 justify-between items-center">
          <div className="flex">
            <button
              onClick={() => setActiveTab("list")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "list"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              文档列表 ({documents.length})
            </button>
            <button
              onClick={() => setActiveTab("vectors")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "vectors"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              向量库
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "upload"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              上传文档
            </button>
          </div>
          {/* {activeTab === "list" && documents.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={loading}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="删除所有文档"
            >
              批量删除
            </button>
          )} */}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "list" ? (
            <div className="space-y-2">
              {loading ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  加载中...
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-lg mb-2">暂无文档</p>
                  <p className="text-sm">点击"上传文档"标签开始添加知识库</p>
                </div>
              ) : (
                documents.map((doc) => (
                  <div
                    key={doc.filename}
                    className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg
                          className="w-6 h-6 text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium text-gray-900 truncate"
                          title={doc.filename}
                        >
                          {doc.filename}
                        </p>
                        <p className="text-xs text-gray-500">
                          {doc.chunks} 个文档块
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(doc.filename)}
                      className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="删除"
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : activeTab === "vectors" ? (
            <div>
              {vectorsLoading ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  加载中...
                </div>
              ) : vectors.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-300"
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
                  <p className="text-lg mb-2">向量库为空</p>
                  <p className="text-sm">请先上传文档</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                    <span>共 {vectors.length} 条向量记录</span>
                    <span>向量维度: {vectors[0]?.vectorDimension || 0} 维</span>
                  </div>
                  {vectors.map((vec, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedChunk(
                            expandedChunk === index ? null : index
                          )
                        }
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-4 h-4 text-purple-600"
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
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-sm font-medium text-gray-900 truncate"
                              title={vec.filename}
                            >
                              {vec.filename}
                            </p>
                            <p className="text-xs text-gray-500">
                              块 #{vec.chunkIndex} | 向量维度: {vec.vectorDimension}
                            </p>
                          </div>
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            expandedChunk === index ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {expandedChunk === index && (
                        <div className="p-3 border-t border-gray-200 bg-white">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                            {vec.text}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* 上传区域 */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                  isDragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400 bg-gray-50"
                } ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input {...getInputProps()} />
                {uploading ? (
                  <div className="space-y-3">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-gray-600">上传中...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-6xl">📄</div>
                    <div>
                      <p className="text-lg font-medium text-gray-700">
                        {isDragActive ? "放开以上传" : "拖拽文件到这里"}
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        或点击选择文件
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">
                      支持 PDF, TXT, MD, DOCX（最大 50MB）
                    </p>
                  </div>
                )}
              </div>

              {/* 消息提示 */}
              {message && (
                <div
                  className={`mt-4 p-4 rounded-lg text-sm ${
                    message.type === "success"
                      ? "bg-green-50 text-green-800 border border-green-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  {message.text}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
