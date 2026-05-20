# 知识库助手项目架构图与时序图

本文基于当前项目代码实现整理，覆盖两个核心流程：

- 文档上传与知识入库
- 用户提问与 RAG 问答

## 项目架构图

```mermaid
flowchart LR
    U[用户]
    FE[前端 React + Vite<br/>App / KnowledgeModal / ModelSettings]
    API[后端 Express API<br/>server.ts]

    subgraph R1[接口层]
      UP[/POST /api/upload/]
      CH[/POST /api/chat/]
      KG[/GET DELETE /api/knowledge/]
      MD[/GET PUT /api/model/]
    end

    subgraph R2[核心服务层]
      ING[ingest.ts<br/>文档解析 / 分块 / 多模态理解]
      RAG[ragChain.ts<br/>关键词提取 / 查询改写 / 混合检索 / 回答生成]
      VS[vectorstore.ts<br/>Embedding / LanceDB / 相似度检索]
    end

    subgraph R3[存储与配置]
      UPDIR[uploads 临时目录]
      DB[LanceDB 向量库]
      CFG[model-config.json]
    end

    subgraph R4[外部模型服务]
      VLM[视觉模型<br/>Qwen-VL / GLM-4V]
      EMB[Embedding 模型]
      LLM[对话生成模型<br/>GLM / DeepSeek / Qwen]
    end

    U --> FE
    FE --> API

    API --> UP
    API --> CH
    API --> KG
    API --> MD

    UP --> ING
    ING --> UPDIR
    ING --> VLM
    ING --> VS
    VS --> EMB
    VS --> DB

    CH --> RAG
    RAG --> VS
    RAG --> LLM
    RAG --> DB

    KG --> VS
    MD --> CFG
    RAG --> CFG
    ING --> CFG
    VS --> CFG
```

## 关键说明

- 前端负责会话管理、知识库管理、模型配置和流式消息展示。
- 后端 `server.ts` 负责服务初始化、路由挂载和健康检查。
- `ingest.ts` 是入库入口，负责把不同格式文件统一转成可检索文本，并保留页面图像引用。
- `vectorstore.ts` 负责调用 embedding、写入 LanceDB、执行向量检索，以及知识库文档管理。
- `ragChain.ts` 负责查询预处理、混合检索、组装上下文、调用大模型流式生成回答。
- 当前项目的特色是“多模态 RAG”：文档不只抽纯文本，还会对页面图、图表、截图做整页理解。

## 时序图

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户
    participant FE as 前端页面
    participant API as Express API
    participant Upload as upload.ts
    participant Ingest as ingest.ts
    participant Vision as 视觉模型
    participant VS as vectorstore.ts
    participant Embed as Embedding模型
    participant DB as LanceDB
    participant Chat as chat.ts
    participant RAG as ragChain.ts
    participant LLM as 生成模型

    rect rgb(245, 248, 255)
        Note over User,DB: 一、文档上传与知识入库
        User->>FE: 选择文件上传
        FE->>API: POST /api/upload
        API->>Upload: 接收文件
        Upload->>Ingest: ingestFile(filePath, filename)
        Ingest->>Ingest: 按文件类型解析(PDF/DOCX/图片/表格/文本)
        alt 需要页面级多模态理解
            Ingest->>Vision: 逐页发送页面图 + 提示词
            Vision-->>Ingest: 返回页面摘要/要点/图表解读/关键词
        end
        Ingest->>Ingest: 合并增强文本并切分 chunk
        Ingest->>VS: addDocuments(chunks)
        VS->>Embed: 批量生成向量
        Embed-->>VS: embedding vectors
        VS->>DB: 写入 LanceDB
        DB-->>VS: 入库完成
        VS-->>Ingest: 返回 chunk 数量
        Ingest-->>Upload: 处理完成
        Upload-->>FE: 上传成功 + chunks
        FE-->>User: 更新知识库列表
    end

    rect rgb(245, 255, 248)
        Note over User,LLM: 二、用户提问与 RAG 问答
        User->>FE: 输入问题
        FE->>API: POST /api/chat(message, history)
        API->>Chat: 进入聊天路由
        Chat->>RAG: getRelevantSources(message)
        RAG->>RAG: 提取关键词
        RAG->>RAG: 查询改写
        RAG->>VS: similaritySearch(rewrittenQuery)
        VS->>Embed: 生成 query embedding
        Embed-->>VS: query vector
        VS->>DB: 向量检索
        DB-->>VS: 返回相似 chunk
        RAG->>VS: getAllDocumentChunks()
        VS->>DB: 读取所有 chunk
        DB-->>VS: 返回文档块
        RAG->>RAG: 关键词检索 + 合并去重
        RAG-->>Chat: 返回 sources
        Chat-->>FE: SSE 推送 sources

        Chat->>RAG: ragQuery(message, history)
        RAG->>RAG: 组装上下文与 Prompt
        alt 命中页面图或图片块
            RAG-->>FE: 先推送 IMAGES_DATA
        end
        RAG->>LLM: 流式生成回答
        LLM-->>RAG: token stream
        RAG-->>Chat: content stream
        Chat-->>FE: SSE 推送 content / done
        FE-->>User: 实时展示答案、来源和相关图片
    end
```

## 代码定位

- 服务入口：[backend/src/server.ts](C:/Users/Administrator.DESKTOP-VH55UL7/Desktop/aoneng/rag-knowledge-assistant/backend/src/server.ts)
- 上传路由：[backend/src/routes/upload.ts](C:/Users/Administrator.DESKTOP-VH55UL7/Desktop/aoneng/rag-knowledge-assistant/backend/src/routes/upload.ts)
- 聊天路由：[backend/src/routes/chat.ts](C:/Users/Administrator.DESKTOP-VH55UL7/Desktop/aoneng/rag-knowledge-assistant/backend/src/routes/chat.ts)
- 知识库管理：[backend/src/routes/knowledge.ts](C:/Users/Administrator.DESKTOP-VH55UL7/Desktop/aoneng/rag-knowledge-assistant/backend/src/routes/knowledge.ts)
- 模型配置：[backend/src/routes/model.ts](C:/Users/Administrator.DESKTOP-VH55UL7/Desktop/aoneng/rag-knowledge-assistant/backend/src/routes/model.ts)
- 入库服务：[backend/src/services/ingest.ts](C:/Users/Administrator.DESKTOP-VH55UL7/Desktop/aoneng/rag-knowledge-assistant/backend/src/services/ingest.ts)
- RAG 服务：[backend/src/services/ragChain.ts](C:/Users/Administrator.DESKTOP-VH55UL7/Desktop/aoneng/rag-knowledge-assistant/backend/src/services/ragChain.ts)
- 向量存储：[backend/src/services/vectorstore.ts](C:/Users/Administrator.DESKTOP-VH55UL7/Desktop/aoneng/rag-knowledge-assistant/backend/src/services/vectorstore.ts)
- 前端入口：[frontend/src/App.tsx](C:/Users/Administrator.DESKTOP-VH55UL7/Desktop/aoneng/rag-knowledge-assistant/frontend/src/App.tsx)
- 前端 API 封装：[frontend/src/api.ts](C:/Users/Administrator.DESKTOP-VH55UL7/Desktop/aoneng/rag-knowledge-assistant/frontend/src/api.ts)
