# 模型配置说明

## 环境变量配置

在 `.env` 文件中配置以下参数：

### 基础配置

```env
# API 配置
GLM_API_KEY=your_api_key_here
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GLM_EMBEDDING_MODEL=embedding-3

# 主模型选择
GLM_MODEL=glm-4-flash  # 或 glm-4.6

# RAG 优化配置
USE_FAST_PREPROCESSING=true  # 或 false
```

## 模型选择

### glm-4-flash（推荐用于快速响应）

- **特点**：响应速度快（~0.7 秒）
- **适用场景**：实时对话、快速问答
- **配置**：
  ```env
  GLM_MODEL=glm-4-flash
  USE_FAST_PREPROCESSING=false  # 全程使用 glm-4-flash
  ```

### GLM-5.1（推荐用于高质量回答）

- **特点**：更智能，但响应较慢（~4 秒）
- **适用场景**：复杂问题、需要深度推理
- **配置方案 1**（推荐）：
  ```env
  GLM_MODEL=glm-4.6
  USE_FAST_PREPROCESSING=true  # 预处理用 glm-4-flash，最终回答用 glm-4.6
  ```
- **配置方案 2**：
  ```env
  GLM_MODEL=glm-4.6
  USE_FAST_PREPROCESSING=false  # 全程使用 GLM-5.1（最慢但最智能）
  ```

## USE_FAST_PREPROCESSING 说明

### true（推荐用于 GLM-5.1）

- **工作流程**：
  1. 关键词提取：使用 glm-4-flash（快速）
  2. 查询改写：使用 glm-4-flash（快速）
  3. 最终回答：使用主模型（GLM-5.1）
- **优点**：预处理快速，最终回答质量高
- **响应时间**：中等（~2-3 秒开始输出）

### false

- **工作流程**：全程使用主模型
- **优点**：配置简单，一致性好
- **响应时间**：
  - glm-4-flash：快（~1 秒）
  - GLM-5.1：慢（~4-5 秒）

## 性能对比

| 配置                | 预处理时间 | 首次输出时间 | 总响应时间 | 回答质量 |
| ------------------- | ---------- | ------------ | ---------- | -------- |
| glm-4-flash + false | ~0.5s      | ~1s          | ~2s        | 良好     |
| glm-4.6 + true      | ~0.5s      | ~2s          | ~4s        | 优秀     |
| glm-4.6 + false     | ~2s        | ~4s          | ~6s        | 优秀     |

## 推荐配置

### 开发/测试环境

```env
GLM_MODEL=glm-4-flash
USE_FAST_PREPROCESSING=false
```

快速迭代，响应迅速。

### 生产环境

```env
GLM_MODEL=glm-4.6
USE_FAST_PREPROCESSING=true
```

平衡速度和质量，推荐配置。

### 高质量场景

```env
GLM_MODEL=glm-4.6
USE_FAST_PREPROCESSING=false
```

追求最佳回答质量，可接受较慢响应。

## 切换模型

修改 `.env` 文件后，重启服务即可生效：

```bash
# 停止服务
npm run stop

# 启动服务
npm run dev
```

## 注意事项

1. **glm-4.6 的 thinking 模式**：

   - glm-4.6 默认会进行深度推理，导致响应较慢
   - 目前 LangChain 不支持直接关闭 thinking 参数
   - 建议使用 `USE_FAST_PREPROCESSING=true` 来优化

2. **Token 计算警告**：

   - LangChain 可能会显示 "Unknown model" 警告
   - 这不影响功能，会自动回退到近似计数

3. **API 兼容性**：
   - 配置支持任何 OpenAI 兼容的 API
   - 只需修改 `GLM_BASE_URL` 和 `GLM_API_KEY`
