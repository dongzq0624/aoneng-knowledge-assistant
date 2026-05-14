<div align="center">

# 🤖 Smart Knowledge Assistant

**Intelligent Document Q&A System Based on RAG Technology**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

English | [简体中文](README.md)

</div>

---

## 📖 Introduction

A ready-to-use **RAG (Retrieval-Augmented Generation)** intelligent Q&A system that brings your documents to life!

Upload your documents (PDF, Word, Markdown, TXT), and the system will automatically understand the content. Then you can ask questions in natural language and get accurate answers based on your documents. It's like having an intelligent assistant who has read all your documents!

### 💡 Why Choose This Project?

**🎯 Designed for Frontend Developers**

- Pure JavaScript/TypeScript stack, no Python required
- Familiar Node.js + React combo, zero learning curve
- Complete type definitions, developer-friendly
- Detailed code comments, easy to understand and modify

**🚀 Truly Ready to Use**

- No complex Python environment setup
- No downloading tens of GB of local models
- No GPU or high-performance server needed
- Just Node.js and an API Key, start in 5 minutes

**📚 Complete Learning Resources**

- Clear project structure, perfect for learning RAG
- Complete workflow from document processing to vector retrieval
- Can be your starting point for AI application development

### 🎯 Key Features

- 🚀 **Ready to Use** - Deploy in 5 minutes, no complex configuration
- 📚 **Multi-Format Support** - PDF, DOCX, Markdown, TXT one-click upload
- 🧠 **Smart Understanding** - Semantic search based on vector retrieval
- 💬 **Streaming Chat** - Real-time AI response display
- 🎨 **Modern UI** - Clean and beautiful design with code highlighting
- 🔒 **Privacy & Security** - Data stored locally, fully controllable
- ⚡ **Performance Optimized** - Hybrid retrieval strategy, fast and accurate
- 🌐 **Fully Online** - No local models needed, uses Zhipu AI cloud service

---

## 🏗️ Tech Stack

**Frontend**

- React 18 + TypeScript + Vite
- TailwindCSS - Modern styling
- React Markdown - Markdown rendering
- Prism.js - Code highlighting

**Backend**

- Node.js + Express + TypeScript
- LangChain.js - AI application framework
- LanceDB - Vector database
- Multer - File handling

**AI Service**

- Zhipu GLM-4 Series Models
  - `glm-4-flash` - Fast response (recommended)
  - `glm-4.6` - High-quality answers
- Embedding-3 - Vectorization model

---

## 🚀 Quick Start

### Prerequisites

Just two things, that's it!

- **Node.js 18+** - [Download](https://nodejs.org/) (Essential for frontend developers)
- **Zhipu API Key** - [Get Free](https://open.bigmodel.cn/) (Free credits for new users, register and use)

> 💡 **Frontend Developer Friendly**: No Python, no CUDA, no GPU needed. If you know Node.js, you can master AI!

### One-Click Start

```bash
# 1. Clone the project
git clone https://github.com/yourusername/rag-knowledge-assistant.git
cd rag-knowledge-assistant

# 2. Configure API Key
cp backend/.env.example backend/.env
# Edit backend/.env and fill in your Zhipu API Key

# 3. Start services
./start.sh          # macOS/Linux
start.bat           # Windows
```

### Manual Start

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Access Application

- 🌐 Frontend: http://localhost:5173
- 🔌 Backend API: http://localhost:3001

---

## ⚙️ Configuration

### Basic Configuration

Edit `backend/.env`:

```env
# API Configuration
GLM_API_KEY=your_api_key_here              # Zhipu API Key
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GLM_EMBEDDING_MODEL=embedding-3

# Model Selection
GLM_MODEL=glm-4-flash                      # or glm-4.6

# RAG Optimization
USE_FAST_PREPROCESSING=true                # Fast preprocessing
```

### Model Selection

| Model         | Response Speed    | Answer Quality     | Use Case                         |
| ------------- | ----------------- | ------------------ | -------------------------------- |
| `glm-4-flash` | ⚡⚡⚡ Fast (~1s) | ⭐⭐⭐ Good        | Daily Q&A, Quick response        |
| `glm-4.6`     | ⚡⚡ Medium (~3s) | ⭐⭐⭐⭐ Excellent | Complex questions, Deep analysis |

**Recommended Configuration**:

- Development: `glm-4-flash` + `USE_FAST_PREPROCESSING=false`
- Production: `glm-4.6` + `USE_FAST_PREPROCESSING=true`

Detailed configuration: [MODEL_CONFIG.md](backend/MODEL_CONFIG.md)

---

## 📖 User Guide

### 1️⃣ Upload Documents

- Click **"Knowledge Base"** in the top right
- Click **"Upload Document"** or drag and drop files
- Supported formats: PDF, DOCX, MD, TXT
- Batch upload supported

### 2️⃣ Smart Q&A

- Enter your question in the input box
- System automatically retrieves relevant documents
- Real-time AI response display
- View source references

### 3️⃣ Manage Knowledge Base

- View uploaded document list
- Check document chunk count
- Delete unwanted documents
- Clear entire knowledge base

---

## 🎯 Core Features

### 🔍 Smart Retrieval

**Hybrid retrieval strategy** combining vector search and keyword matching:

1. **Query Optimization** - Auto extract keywords, optimize retrieval
2. **Vector Retrieval** - Semantic similarity based understanding
3. **Keyword Retrieval** - Precise term matching
4. **Smart Filtering** - Auto filter low-relevance documents
5. **Result Merging** - Deduplication and ranking

### 💬 Streaming Chat

- Real-time AI generation display
- Markdown format support
- Code block syntax highlighting
- Complete table rendering
- One-click code copy

### 📚 Document Processing

- Automatic text extraction
- Smart chunking (500 chars/chunk, 100 chars overlap)
- Vectorized storage
- Large file support

---

## 🚀 Performance

### Implemented Optimizations

- ✅ **Hybrid Retrieval** - Vector + Keyword for better accuracy
- ✅ **Smart Filtering** - Auto filter low-relevance docs
- ✅ **Query Optimization** - Keyword extraction and query rewriting
- ✅ **Fast Preprocessing** - Use glm-4-flash for speed
- ✅ **Streaming Output** - Real-time display
- ✅ **Document Chunking** - Optimized token usage

### Performance Metrics

| Metric                | Value   |
| --------------------- | ------- |
| First Response Time   | < 2s    |
| Document Upload Speed | ~1MB/s  |
| Vector Search Speed   | < 100ms |
| Concurrent Support    | 100+    |

---

## 🔐 Security & Privacy

- ✅ **Local Storage** - Vector data stored in local LanceDB
- ✅ **API Key Protection** - Managed via environment variables
- ✅ **HTTPS Support** - SSL certificate configurable
- ✅ **Private Deployment** - Intranet deployment supported
- ✅ **Data Isolation** - Independent database per instance

---

## 🤝 Contributing

Contributions, suggestions, and bug reports are welcome!

### How to Contribute

1. Fork the project
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Submit Pull Request

---

## 📝 Changelog

### v1.0.0 (2024-01)

- ✨ Initial release
- 🚀 Support PDF, DOCX, MD, TXT documents
- 💬 Streaming chat implementation
- 🔍 Hybrid retrieval strategy
- 🎨 Modern UI design
- ⚡ Performance optimization

---

## 🙏 Acknowledgments

Thanks to these open source projects:

- [LangChain](https://langchain.com/) - AI application framework
- [LanceDB](https://lancedb.com/) - Vector database
- [Zhipu AI](https://open.bigmodel.cn/) - LLM service
- [React](https://react.dev/) - Frontend framework
- [TailwindCSS](https://tailwindcss.com/) - CSS framework
- [Vite](https://vitejs.dev/) - Build tool

---

## 📄 License

This project is licensed under the [MIT](LICENSE) License.

---

## 💬 Contact

- 📧 Email: your.email@example.com
- 🐛 Issues: [GitHub Issues](../../issues)
- 💡 Discussions: [GitHub Discussions](../../discussions)

---

<div align="center">

### 🌟 If this project helps you, please give it a Star!

**Let AI be your smart knowledge assistant** 📚

[⬆ Back to Top](#-smart-knowledge-assistant)

</div>
