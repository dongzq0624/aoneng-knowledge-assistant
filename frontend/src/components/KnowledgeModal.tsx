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
  // 分页相关状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // 筛选相关状态
  const [filterFilename, setFilterFilename] = useState("");
  const [docFilterFilename, setDocFilterFilename] = useState("");

  // 计算筛选后的向量数据
  const filteredVectors = vectors.filter(vec => 
    vec.filename.toLowerCase().includes(filterFilename.toLowerCase())
  );

  // 计算筛选后的文档数据
  const filteredDocuments = documents.filter(doc => 
    doc.filename.toLowerCase().includes(docFilterFilename.toLowerCase())
  );

  // 计算分页后的数据
  const paginatedVectors = () => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredVectors.slice(start, end);
  };

  // 计算总页数
  const totalPages = Math.ceil(filteredVectors.length / pageSize);

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

  // 打开时加载数据并重置状态
  useEffect(() => {
    if (isOpen) {
      loadDocuments();
      setDocFilterFilename("");
      if (activeTab === "vectors") {
        loadVectors();
      }
    }
  }, [isOpen]);

  // 切换到文档列表标签时重置筛选
  useEffect(() => {
    if (activeTab === "list") {
      setDocFilterFilename("");
    }
  }, [activeTab]);

  // 切换到向量库标签时加载数据并重置状态
  useEffect(() => {
    if (isOpen && activeTab === "vectors") {
      loadVectors();
      setCurrentPage(1);
      setFilterFilename("");
      setExpandedChunk(null);
    }
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-2 sm:mx-4 overflow-hidden max-h-[85vh] sm:max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">知识库管理</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg
              className="w-5 sm:w-6 h-5 sm:h-6"
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
        <div className="flex border-b border-gray-200 px-4 sm:px-6 justify-between items-center overflow-x-auto">
          <div className="flex flex-1 min-w-0">
            <button
              onClick={() => setActiveTab("list")}
              className={`px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex-shrink-0 ${
                activeTab === "list"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              文档列表 ({documents.length})
            </button>
            <button
              onClick={() => setActiveTab("vectors")}
              className={`px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex-shrink-0 ${
                activeTab === "vectors"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              向量库
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex-shrink-0 ${
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
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              title="删除所有文档"
            >
              批量删除
            </button>
          )} */}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === "list" ? (
            <div className="space-y-3">
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
                <>
                  {/* 搜索框 */}
                  <div className="relative">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      placeholder="按文件名搜索..."
                      value={docFilterFilename}
                      onChange={(e) => setDocFilterFilename(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* 文档列表 */}
                  {filteredDocuments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>没有找到匹配的文档</p>
                    </div>
                  ) : (
                    filteredDocuments.map((doc) => (
                      <div
                        key={doc.filename}
                        className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="w-8 sm:w-10 h-8 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-4 sm:w-6 h-4 sm:h-6 text-blue-600"
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
                          className="ml-2 sm:ml-4 p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
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
                </>
              )}
            </div>
          ) : activeTab === "vectors" ? (
            <div className="flex flex-col h-full">
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
                <>
                  {/* 筛选和统计栏 */}
                  <div className="mb-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">共 {filteredVectors.length} 条向量记录</span>
                        {vectors.length > 0 && (
                          <span className="text-sm text-gray-500">
                            | 向量维度: {vectors[0]?.vectorDimension || 0} 维
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-500">每页显示:</label>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={10}>10条</option>
                          <option value={20}>20条</option>
                          <option value={50}>50条</option>
                          <option value={100}>100条</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* 搜索框 */}
                    <div className="relative">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      <input
                        type="text"
                        placeholder="按文件名搜索..."
                        value={filterFilename}
                        onChange={(e) => {
                          setFilterFilename(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* 向量列表 */}
                  <div className="flex-1 overflow-y-auto space-y-3">
                    {filteredVectors.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p>没有找到匹配的向量记录</p>
                      </div>
                    ) : (
                      paginatedVectors().map((vec, idx) => {
                        // 计算在原始filteredVectors中的索引
                        const originalIndex = (currentPage - 1) * pageSize + idx;
                        return (
                          <div
                            key={originalIndex}
                            className="border border-gray-200 rounded-lg overflow-hidden"
                          >
                            <button
                              onClick={() =>
                                setExpandedChunk(
                                  expandedChunk === originalIndex ? null : originalIndex
                                )
                              }
                              className="w-full flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                <div className="w-7 sm:w-8 h-7 sm:h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <svg
                                    className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-purple-600"
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
                                className={`w-4 sm:w-5 h-4 sm:h-5 text-gray-400 transition-transform ${
                                  expandedChunk === originalIndex ? "rotate-180" : ""
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
                            {expandedChunk === originalIndex && (
                              <div className="p-2.5 sm:p-3 border-t border-gray-200 bg-white">
                                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                                  {vec.text}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* 分页控件 */}
                  {filteredVectors.length > 0 && totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-500">
                        第 {currentPage} 页 / 共 {totalPages} 页
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          上一页
                        </button>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div>
              {/* 上传区域 */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-6 sm:p-12 text-center cursor-pointer transition-all ${
                  isDragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400 bg-gray-50"
                } ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input {...getInputProps()} />
                {uploading ? (
                  <div className="space-y-3">
                    <div className="animate-spin rounded-full h-10 sm:h-12 w-10 sm:w-12 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-gray-600">上传中...</p>
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="text-4xl sm:text-6xl">📄</div>
                    <div>
                      <p className="text-base sm:text-lg font-medium text-gray-700">
                        {isDragActive ? "放开以上传" : "拖拽文件到这里"}
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        或点击选择文件
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">
                      支持 PDF, TXT, MD, DOCX, XLSX, CSV, PNG, JPG, WEBP（最大 50MB）
                    </p>
                  </div>
                )}
              </div>

              {/* 消息提示 */}
              {message && (
                <div
                  className={`mt-4 p-3 sm:p-4 rounded-lg text-sm ${
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
