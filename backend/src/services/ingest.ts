// 文件解析、页面级多模态理解和向量化服务
import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import * as xlsx from "xlsx";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { vectorStore } from "./vectorstore.js";
import type { DocumentChunk } from "../types.js";

const execFileAsync = promisify(execFile);

// ==================== 语义分块器配置 ====================

// 智能分割器配置（用于超长块的二次拆分）
const semanticSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 2000,
  chunkOverlap: 150,
  separators: [
    "\n\n【",      // 多模态解读分节符
    "\n\n##",     // 二级标题
    "\n\n#",       // 一级标题
    "\n---",       // 分隔线
    "\n\n",        // 段落（最高优先级）
    "\n",          // 换行
    "。|！|？",   // 句子边界（中文）
    ". |! |? ",   // 句子边界（英文）
    ", |，",      // 逗号分隔
  ],
});

// 块元数据：携带当前块的标题层级信息，用于标题继承
interface ChunkMeta {
  headings: string[];   // 当前块上方的标题链，如 ["第一章", "1.1 概述"]
  content: string;
  type: "paragraph" | "table" | "list" | "heading" | "other";
}

// 表格识别正则
const TABLE_PATTERN = /^\|[^\n]+\|(\n\|[^\n]+\|)*/;
// 列表识别正则（有序和无序）
const LIST_PATTERN = /^(\d+[.、]|\*|[-•▪▸])\s+/;
// 标题识别正则（支持 # 和 中文括号编号）
const HEADING_PATTERN = /^(#{1,6}\s+[\s\S]+|[\u4e00-\u9fa5零一二三四五六七八九十]+[章节条点][\s\S]+|^\d+[.、][\u4e00-\u9fa5a-zA-Z0-9][^\n]*$)/;

interface TextSegment {
  content: string;
  type: "paragraph" | "table" | "list" | "heading" | "other";
}

// ==================== 分块核心逻辑 ====================

/**
 * 识别文本段落的类型
 */
function identifySegmentType(text: string): TextSegment["type"] {
  const trimmed = text.trim();
  if (!trimmed) return "other";

  if (TABLE_PATTERN.test(trimmed)) return "table";
  if (LIST_PATTERN.test(trimmed)) return "list";
  if (HEADING_PATTERN.test(trimmed)) return "heading";
  if (trimmed.length > 50 || trimmed.includes("\n")) return "paragraph";

  return "other";
}

/**
 * 解析标题层级
 * 输入: "# 第一章 概述" → "第一章 概述"
 * 输入: "1.1 背景介绍"  → "1.1 背景介绍"
 * 输入: "【多模态解读】" → "多模态解读"
 */
function parseHeading(text: string): string | null {
  const trimmed = text.trim();
  const m1 = trimmed.match(/^#{1,6}\s+(.+)/);
  if (m1) return m1[1].trim();

  const m2 = trimmed.match(/^[\u4e00-\u9fa5零一二三四五六七八九十]+[章节条点][\s\S]+/);
  if (m2) return m2[0].trim();

  const m3 = trimmed.match(/^\d+[.、][\u4e00-\u9fa5a-zA-Z0-9][^\n]*/);
  if (m3) return m3[0].trim();

  const m4 = trimmed.match(/^【(.+?)】/);
  if (m4) return m4[1].trim();

  return null;
}

/**
 * 智能语义分块（带标题继承）
 *
 * 策略：
 * 1. 按段落/标题/表格语义边界分割
 * 2. 标题自动成为独立块，并被后续块继承
 * 3. 表格和列表优先保留完整性，超长才拆分
 * 4. 相邻块之间保留 20% 重叠
 * 5. 段落在合并时动态判断，避免在句子中间截断
 *
 * @param text        原始文本
 * @param parentHeadings  继承的父级标题链（用于嵌套调用）
 * @returns           分块结果，每块自带标题链
 */
async function semanticChunk(
  text: string,
  parentHeadings: string[] = []
): Promise<ChunkMeta[]> {
  if (!text.trim()) return [];

  // 统一换行符
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const result: ChunkMeta[] = [];

  // 当前累积的块内容
  let currentContent = "";
  let currentType: TextSegment["type"] = "other";
  // 当前块的标题链（继承自父级 + 新遇到的标题）
  let currentHeadings = [...parentHeadings];

  // 当前块累积了多少个原始段落（用于计算重叠）
  let currentParagraphCount = 0;
  // 重叠缓冲区
  let overlapBuffer: string[] = [];
  const OVERLAP_RATIO = 0.2; // 保留 20% 重叠

  function flushCurrentBlock() {
    if (!currentContent.trim()) return;

    const trimmed = currentContent.trim();
    if (trimmed.length > 10) {
      result.push({
        headings: [...currentHeadings],
        content: trimmed,
        type: currentType,
      });
    }

    // 重叠缓冲区：保留最后 20% 的段落
    if (currentParagraphCount > 1) {
      const keepCount = Math.max(1, Math.floor(currentParagraphCount * OVERLAP_RATIO));
      overlapBuffer = lines
        .slice(0, keepCount)
        .join("\n")
        .split(/\n{2,}/)
        .slice(-keepCount);
    }

    currentContent = "";
    currentType = "other";
    currentParagraphCount = 0;
  }

  // 将 lines 按空行分割成段落组
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (buffer.length > 0) {
        paragraphs.push(buffer.join("\n"));
        buffer = [];
      }
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) {
    paragraphs.push(buffer.join("\n"));
  }

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    const segType = identifySegmentType(trimmedPara);
    const heading = parseHeading(trimmedPara);

    // 遇到标题：结束当前块，标题自己成块
    if (segType === "heading") {
      flushCurrentBlock();
      result.push({
        headings: [...currentHeadings],
        content: trimmedPara,
        type: "heading",
      });
      // 将此标题加入后续块的标题链
      if (heading) {
        currentHeadings = [...currentHeadings, heading];
      }
      continue;
    }

    // 表格/列表：优先保留完整性
    if (segType === "table" || segType === "list") {
      // 如果加上当前表格后超过 1200 字，先 flush 当前块
      if (currentContent.length + trimmedPara.length > 1200) {
        flushCurrentBlock();
      }
      // 表格/列表独立成块，不与其他内容混合
      if (currentContent.trim()) {
        flushCurrentBlock();
      }
      const tableChunks = splitOverlongTable(trimmedPara);
      for (const tc of tableChunks) {
        result.push({
          headings: [...currentHeadings],
          content: tc.trim(),
          type: segType,
        });
      }
      continue;
    }

    // 普通段落：动态合并
    currentParagraphCount++;
    const candidate = currentContent
      ? currentContent + "\n\n" + trimmedPara
      : trimmedPara;

    if (candidate.length <= 800) {
      currentContent = candidate;
      if (currentType === "other") currentType = "paragraph";
    } else if (currentContent.length === 0) {
      // 当前块为空但单个段落就超长，按句子拆分
      const subChunks = splitLongParagraph(trimmedPara);
      for (const sc of subChunks) {
        result.push({
          headings: [...currentHeadings],
          content: sc.trim(),
          type: "paragraph",
        });
      }
      currentParagraphCount++;
    } else {
      // 当前块已有内容但加上新段落会超，先 push 当前块
      flushCurrentBlock();
      // 如果单个段落本身超长，先拆分再逐个 push
      if (trimmedPara.length > 800) {
        const subChunks = splitLongParagraph(trimmedPara);
        for (const sc of subChunks) {
          result.push({
            headings: [...currentHeadings],
            content: sc.trim(),
            type: "paragraph",
          });
        }
        currentParagraphCount++;
      } else {
        currentContent = trimmedPara;
        currentParagraphCount = 1;
        currentType = "paragraph";
      }
    }
  }

  flushCurrentBlock();
  return result.filter((r) => r.content.trim().length > 10);
}

/**
 * 超长表格按行拆分，保留表头
 */
function splitOverlongTable(tableText: string): string[] {
  const chunks: string[] = [];
  const lines = tableText.split("\n");
  const header = lines[0];
  if (lines.length <= 1) return [tableText];

  let currentRows = header + "\n";
  let currentSize = header.length;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (currentSize + row.length > 1000 && currentRows !== header + "\n") {
      chunks.push(currentRows.trim());
      currentRows = header + "\n" + row + "\n";
      currentSize = header.length + row.length;
    } else {
      currentRows += row + "\n";
      currentSize += row.length;
    }
  }

  if (currentRows.trim() !== header.trim()) {
    chunks.push(currentRows.trim());
  }

  return chunks.length > 0 ? chunks : [tableText];
}

/**
 * 超长段落按句子拆分
 */
function splitLongParagraph(text: string): string[] {
  const sentences = text.split(/(?<=[。！？.!?])\s*/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;

    if ((current + sentence).length <= 800) {
      current += sentence;
    } else {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

/**
 * 对超长块做二次拆分（使用 LangChain splitter）
 */
async function finalSplit(
  chunks: ChunkMeta[],
  splitter: RecursiveCharacterTextSplitter
): Promise<ChunkMeta[]> {
  const finalChunks: ChunkMeta[] = [];

  for (const chunk of chunks) {
    if (chunk.content.length > 1000) {
      try {
        const subTexts = await splitter.splitText(chunk.content);
        for (const subText of subTexts) {
          const trimmed = subText.trim();
          if (trimmed.length > 10) {
            finalChunks.push({
              headings: chunk.headings,
              content: trimmed,
              type: chunk.type,
            });
          }
        }
      } catch {
        // 拆分失败，保留原块
        finalChunks.push(chunk);
      }
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks;
}

/**
 * 将带标题链的 ChunkMeta 转换为最终的文档块文本
 * 在每个块前附加继承的标题作为前缀
 */
function buildChunkText(chunk: ChunkMeta): string {
  if (chunk.headings.length === 0) {
    return chunk.content;
  }
  // 用标题链作为前缀，帮助 LLM 理解上下文归属
  const prefix = chunk.headings.join(" › ");
  return `[${prefix}]\n${chunk.content}`;
}

interface ParsedPage {
  pageNumber: number;
  dataUrl: string;
  textHint?: string;
}

interface ParsedResult {
  pages: ParsedPage[];
  fallbackText: string;
  mode: "page-image" | "text" | "image";
}

interface VisionConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens: number;
}

interface PageInterpretation {
  pageNumber: number;
  text: string;
  dataUrl: string;
}

function normalizeIngestText(text: string): string {
  return text.replace(/\r/g, "").trim();
}

function normalizeQwenVisionModel(model?: string): string {
  const normalized = (model || "").trim();
  if (!normalized) {
    return "qwen-vl-plus";
  }

  const lowered = normalized.toLowerCase();
  if (lowered.includes("vl") || lowered.includes("vision")) {
    return normalized;
  }

  return normalized;
}

async function splitTextSafely(
  splitter: RecursiveCharacterTextSplitter,
  text: string
): Promise<{ text: string; headings: string[] }[]> {
  const normalized = normalizeIngestText(text);
  if (!normalized) {
    return [];
  }

  // 第一步：语义分块（带标题继承）
  const semanticChunks = await semanticChunk(normalized);
  // 第二步：对超长块做二次拆分
  const finalChunks = await finalSplit(semanticChunks, splitter);
  // 第三步：构建最终文本（附加标题前缀）
  return finalChunks
    .map((chunk) => ({
      text: buildChunkText(chunk),
      headings: chunk.headings,
    }))
    .filter((item) => item.text.trim().length > 10);
}

// ==================== 配置和通用工具 ====================

async function loadJsonConfig(): Promise<any> {
  const configFile = path.join(process.cwd(), "model-config.json");

  try {
    const data = await fs.readFile(configFile, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function loadVisionConfig(): Promise<VisionConfig> {
  const config = await loadJsonConfig();
  const provider = config.provider || "qwen";

  if (provider === "deepseek") {
    return {
      apiKey: config.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "",
      baseURL:
        config.deepseekBaseUrl ||
        process.env.DEEPSEEK_BASE_URL ||
        "https://api.deepseek.com/v1",
      model:
        config.visionModel || config.generationModel || "DeepSeek-V4-Flash",
      maxTokens: config.visionMaxTokens || 1800,
    };
  }

  if (provider === "qwen") {
    return {
      apiKey: config.qwenApiKey || process.env.QWEN_API_KEY || "",
      baseURL:
        config.qwenBaseUrl ||
        process.env.QWEN_BASE_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: normalizeQwenVisionModel(
        config.visionModel || config.generationModel || "Qwen-VL-Plus"
      ),
      maxTokens: config.visionMaxTokens || 1800,
    };
  }

  if (provider === "glm") {
    return {
      apiKey: config.glmApiKey || process.env.GLM_API_KEY || "",
      baseURL:
        config.glmBaseUrl ||
        process.env.GLM_BASE_URL ||
        "https://open.bigmodel.cn/api/paas/v4",
      model: config.visionModel || "GLM-5V-Turbo",
      maxTokens: config.visionMaxTokens || 1800,
    };
  }

  throw new Error("当前提供商不支持视觉模型，请切换为 qwen 或 glm");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dataUrlFromBuffer(buffer: Buffer | Uint8Array, mimeType = "image/png"): string {
  return `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const normalized = rawLine.trim();
    if (!normalized) {
      lines.push("");
      continue;
    }

    let current = normalized;
    while (current.length > maxChars) {
      lines.push(current.slice(0, maxChars));
      current = current.slice(maxChars);
    }
    lines.push(current);
  }

  return lines;
}

async function compressImage(dataUrl: string): Promise<string> {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const rawBytes = Math.ceil((base64.length * 3) / 4);
  const maxBytes = 4 * 1024 * 1024;

  if (rawBytes <= maxBytes) {
    return dataUrl;
  }

  console.log(`🖼️ 页面图压缩: ${(rawBytes / 1024 / 1024).toFixed(1)}MB -> ...`);

  try {
    const sharp = (await import("sharp")).default;
    const compressed = await sharp(Buffer.from(base64, "base64"))
      .resize({ width: 1800, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    console.log(`✅ 页面图压缩完成: ${(compressed.length / 1024 / 1024).toFixed(1)}MB`);
    return dataUrlFromBuffer(compressed, "image/jpeg");
  } catch (error) {
    console.warn(`⚠️ 页面图压缩失败，保留原图: ${error}`);
    return dataUrl;
  }
}

// ==================== 页面转高清图片 ====================

async function parsePDFAsPageImages(filePath: string): Promise<ParsedResult> {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const [screenshots, textResult] = await Promise.all([
      parser.getScreenshot({
        scale: 2,
        imageDataUrl: true,
        imageBuffer: false,
      }),
      parser.getText().catch(() => null),
    ]);

    const pageTexts = textResult?.pages || [];
    const pages: ParsedPage[] = screenshots.pages.map((page: any, index: number) => ({
      pageNumber: page.pageNumber || index + 1,
      dataUrl: page.dataUrl || dataUrlFromBuffer(page.data, "image/png"),
      textHint: pageTexts[index]?.text || "",
    }));

    const fallbackText = pageTexts
      .map((page: any, index: number) => `第 ${index + 1} 页\n${page.text || ""}`)
      .join("\n\n");

    console.log(`📄 PDF 已转为 ${pages.length} 张高清页面图`);
    return { pages, fallbackText, mode: "page-image" };
  } finally {
    await parser.destroy();
  }
}

async function findLibreOffice(): Promise<string | null> {
  const candidates =
    process.platform === "win32"
      ? [
          "soffice.exe",
          "libreoffice.exe",
          "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
          "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
        ]
      : ["soffice", "libreoffice"];

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"], { timeout: 5000 });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

async function convertDocxToPdf(filePath: string): Promise<string | null> {
  const soffice = await findLibreOffice();
  if (!soffice) {
    return null;
  }

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "rag-docx-pdf-"));

  await execFileAsync(
    soffice,
    ["--headless", "--convert-to", "pdf", "--outdir", outDir, filePath],
    { timeout: 120000 }
  );

  const pdfPath = path.join(outDir, `${path.basename(filePath, path.extname(filePath))}.pdf`);
  await fs.access(pdfPath);
  return pdfPath;
}

async function renderTextPagesAsImages(text: string): Promise<ParsedPage[]> {
  const sharp = (await import("sharp")).default;
  const normalized = text.trim() || "空文档";
  const lines = wrapText(normalized, 42);
  const linesPerPage = 42;
  const pages: ParsedPage[] = [];

  for (let pageIndex = 0; pageIndex < Math.max(1, Math.ceil(lines.length / linesPerPage)); pageIndex++) {
    const pageLines = lines.slice(pageIndex * linesPerPage, (pageIndex + 1) * linesPerPage);
    const textSpans = pageLines
      .map((line, index) => {
        const y = 110 + index * 34;
        return `<text x="80" y="${y}" font-size="24" font-family="Arial, 'Microsoft YaHei', sans-serif" fill="#111827">${escapeXml(line)}</text>`;
      })
      .join("\n");

    const svg = `
      <svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">
        <rect width="1240" height="1754" fill="#ffffff"/>
        <rect x="52" y="52" width="1136" height="1650" fill="#ffffff" stroke="#d1d5db" stroke-width="2"/>
        <text x="80" y="70" font-size="18" font-family="Arial, sans-serif" fill="#6b7280">DOCX fallback page ${pageIndex + 1}</text>
        ${textSpans}
      </svg>
    `;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    pages.push({
      pageNumber: pageIndex + 1,
      dataUrl: dataUrlFromBuffer(png, "image/png"),
      textHint: pageLines.join("\n"),
    });
  }

  return pages;
}

async function extractDocxEmbeddedImages(filePath: string): Promise<ParsedPage[]> {
  const images: ParsedPage[] = [];

  await mammoth.convertToHtml(
    { path: filePath },
    {
      convertImage: (mammoth as any).images.inline(async (element: any) => {
        const buffer = await element.read("nodebuffer");
        const mimeType = element.contentType || "image/png";
        images.push({
          pageNumber: images.length + 1,
          dataUrl: dataUrlFromBuffer(buffer, mimeType),
          textHint: "DOCX 内嵌图片",
        });
        return "";
      }),
    }
  );

  return images;
}

async function parseDOCXAsPageImages(filePath: string): Promise<ParsedResult> {
  const textResult = await mammoth.extractRawText({ path: filePath });
  const fallbackText = textResult.value.trim();

  try {
    const pdfPath = await convertDocxToPdf(filePath);
    if (pdfPath) {
      console.log("📄 DOCX 已通过 LibreOffice 转为 PDF，继续渲染页面图");
      try {
        const parsedPdf = await parsePDFAsPageImages(pdfPath);
        return {
          ...parsedPdf,
          fallbackText: parsedPdf.fallbackText || fallbackText,
        };
      } finally {
        await fs.rm(path.dirname(pdfPath), { recursive: true, force: true });
      }
    }
  } catch (error) {
    console.warn(`⚠️ DOCX 转 PDF 失败，使用高清文本页图降级: ${error}`);
  }

  const textPages = await renderTextPagesAsImages(fallbackText);
  const embeddedImages = await extractDocxEmbeddedImages(filePath);
  const pages = [
    ...textPages,
    ...embeddedImages.map((image, index) => ({
      ...image,
      pageNumber: textPages.length + index + 1,
    })),
  ];

  console.log(
    `📄 DOCX 已转为 ${textPages.length} 张高清文本页面图 + ${embeddedImages.length} 张内嵌图片（未检测到 LibreOffice）`
  );
  return { pages, fallbackText, mode: "page-image" };
}

async function parseImageFile(filePath: string): Promise<ParsedResult> {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const buffer = await fs.readFile(filePath);

  return {
    pages: [{ pageNumber: 1, dataUrl: dataUrlFromBuffer(buffer, mimeType) }],
    fallbackText: "[独立图片文件]",
    mode: "image",
  };
}

async function parseTable(filePath: string): Promise<ParsedResult> {
  const workbook = xlsx.readFile(filePath);
  let fullText = "";

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = xlsx.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      fullText += `\n--- 表格: ${sheetName} ---\n${csv}\n`;
    }
  }

  return {
    pages: [],
    fallbackText: fullText || "空表格",
    mode: "text",
  };
}

async function parseText(filePath: string): Promise<ParsedResult> {
  return {
    pages: [],
    fallbackText: await fs.readFile(filePath, "utf-8"),
    mode: "text",
  };
}

async function parseFile(filePath: string): Promise<ParsedResult> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".pdf":
      return parsePDFAsPageImages(filePath);
    case ".docx":
      return parseDOCXAsPageImages(filePath);
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".webp":
      return parseImageFile(filePath);
    case ".xlsx":
    case ".csv":
      return parseTable(filePath);
    case ".txt":
    case ".md":
      return parseText(filePath);
    default:
      throw new Error(`不支持的文件类型: ${ext}`);
  }
}

// ==================== 视觉模型页面解读 ====================

async function visionChat(config: VisionConfig, dataUrl: string, prompt: string): Promise<string> {
  if (!config.apiKey) {
    throw new Error("未配置视觉模型 API Key，请在 model-config.json 或环境变量中配置");
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: config.maxTokens,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`视觉模型调用失败: ${response.status} - ${errorText}`);
  }

  const data: any = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function interpretPage(
  config: VisionConfig,
  page: ParsedPage,
  filename: string,
  totalPages: number
): Promise<PageInterpretation> {
  const image = await compressImage(page.dataUrl);
  const prompt = `你是企业级多模态 RAG 的页面解析器。请把这整页当成一张完整页面图来理解，不要只做 OCR。

文件名：${filename}
页码：${page.pageNumber}/${totalPages}
${page.textHint ? `页面文本候选（仅作辅助，以图片为准）：\n${page.textHint.slice(0, 1800)}\n` : ""}

请输出纯文本，结构如下：
【页面摘要】
用 3-6 句话概括本页全部内容。

【正文要点】
列出本页所有重要文字、流程、结论、定义、配置项、步骤或约束。

【图表/表格/截图解读】
如果存在图表、表格、流程图、拓扑图、截图或示意图，请解释其含义、对象关系、趋势、异常点和业务结论；没有则写“无”。

【关键数据】
提取本页出现的数值、指标、表格字段、单位、日期、比例、名称、型号、接口、路径、错误码等可检索数据；没有则写“无”。

【检索关键词】
给出 5-12 个适合检索的关键词。`;

  console.log(`👁️ 视觉模型解读页面 ${page.pageNumber}/${totalPages}...`);
  const text = await visionChat(config, image, prompt);
  await sleep(300);

  return {
    pageNumber: page.pageNumber,
    text: `# ${filename} - 第 ${page.pageNumber} 页多模态解读\n\n${text}`,
    dataUrl: image,
  };
}

// ==================== 并发控制工具 ====================

interface Semaphore {
  acquire: () => Promise<() => void>;
}

/**
 * 创建一个信号量，用于限制并发数量
 */
function createSemaphore(maxConcurrent: number): Semaphore {
  let running = 0;
  let waiters: Array<() => void> = [];

  return {
    acquire: async () => {
      if (running < maxConcurrent) {
        running++;
        return () => {
          running--;
          const next = waiters.shift();
          if (next) next();
        };
      }

      return new Promise<void>((resolve) => {
        waiters.push(resolve);
      }).then(() => {
        running++;
        return () => {
          running--;
          const next = waiters.shift();
          if (next) next();
        };
      });
    },
  };
}

// ==================== 智能速率限制器 ====================

interface RateLimiter {
  getWaitTime: () => number;
  recordSuccess: () => void;
  recordRateLimit: () => void;
  waitIfNeeded: () => Promise<void>;
}

function createRateLimiter(provider: string): RateLimiter {
  let lastRequestTime = 0;
  let baseInterval = 0;
  let consecutiveRateLimits = 0;
  let cooldownUntil = 0;

  switch (provider.toLowerCase()) {
    case "glm":
      baseInterval = 2500;
      break;
    case "qwen":
      baseInterval = 1500;
      break;
    default:
      baseInterval = 1500;
  }

  const limiter: RateLimiter = {
    getWaitTime: () => {
      const now = Date.now();
      const sinceLast = now - lastRequestTime;
      const sinceCooldown = Math.max(0, cooldownUntil - now);
      return Math.max(0, baseInterval - sinceLast) + sinceCooldown;
    },
    recordSuccess: () => {
      lastRequestTime = Date.now();
      if (consecutiveRateLimits > 0) {
        consecutiveRateLimits = Math.max(0, consecutiveRateLimits - 1);
        cooldownUntil = 0;
      }
    },
    recordRateLimit: () => {
      consecutiveRateLimits++;
      const backoffMs = Math.min(60000, 2000 * Math.pow(2, consecutiveRateLimits - 1));
      cooldownUntil = Date.now() + backoffMs;
      console.log(`⚠️ 触发速率限制，退避 ${(backoffMs / 1000).toFixed(1)}s (连续限流: ${consecutiveRateLimits} 次)`);
    },
    waitIfNeeded: async () => {
      const waitTime = limiter.getWaitTime();
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  };

  return limiter;
}

let globalRateLimiter: RateLimiter | null = null;
let currentProvider: string = "";

async function initVisionRateLimiter(): Promise<RateLimiter> {
  const config = await loadVisionConfig();
  const provider = config.model.includes("qwen") ? "qwen"
    : config.model.includes("glm") ? "glm"
    : "default";

  if (provider !== currentProvider) {
    currentProvider = provider;
    globalRateLimiter = createRateLimiter(provider);
  }
  return globalRateLimiter!;
}

async function getVisionConcurrency(): Promise<number> {
  const config = await loadVisionConfig();
  if (config.model.includes("qwen")) return 2;
  if (config.model.includes("glm")) return 1;
  return 2;
}

// ==================== 页面解读（并发优化） ====================

async function interpretPageWithRetry(
  config: VisionConfig,
  page: ParsedPage,
  filename: string,
  totalPages: number,
  rateLimiter: RateLimiter,
  maxRetries: number = 3
): Promise<PageInterpretation> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await rateLimiter.waitIfNeeded();
      return await interpretPage(config, page, filename, totalPages);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRateLimit =
        lastError.message.includes("429") ||
        lastError.message.includes("Too Many Requests") ||
        lastError.message.includes("速率限制") ||
        lastError.message.includes("1302");

      if (isRateLimit) {
        rateLimiter.recordRateLimit();
      }

      if (attempt < maxRetries) {
        const baseDelay = isRateLimit ? 3000 : 1000;
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(`⏳ 第 ${page.pageNumber} 页重试中 (${attempt + 1}/${maxRetries})，等待 ${(delay / 1000).toFixed(1)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`❌ 第 ${page.pageNumber} 页视觉解读失败（已重试 ${maxRetries} 次）:`, lastError?.message);
  const fallback = page.textHint || "[页面视觉解读失败，且没有可用文本]";
  return {
    pageNumber: page.pageNumber,
    text: `# ${filename} - 第 ${page.pageNumber} 页多模态解读\n\n【页面摘要】\n${fallback}\n\n【图表/表格/截图解读】\n视觉模型调用失败。\n\n【关键数据】\n请参考页面文本候选。`,
    dataUrl: page.dataUrl,
  };
}

async function interpretPages(parsed: ParsedResult, filename: string): Promise<PageInterpretation[]> {
  if (parsed.pages.length === 0) {
    return [];
  }

  const config = await loadVisionConfig();
  const concurrency = await getVisionConcurrency();
  const rateLimiter = await initVisionRateLimiter();
  const semaphore = createSemaphore(concurrency);

  console.log(`👁️ 使用视觉模型进行整页理解: ${config.model} (并发数: ${concurrency})`);
  console.log(`⏱️ 启用智能速率限制，基础间隔: ${currentProvider === 'glm' ? '2.5s' : currentProvider === 'qwen' ? '1.5s' : '1.5s'}`);

  const tasks = parsed.pages.map(async (page): Promise<PageInterpretation> => {
    const release = await semaphore.acquire();
    try {
      return await interpretPageWithRetry(config, page, filename, parsed.pages.length, rateLimiter);
    } finally {
      release();
    }
  });

  const results = await Promise.all(tasks);
  results.sort((a, b) => a.pageNumber - b.pageNumber);

  console.log(`✅ 视觉模型解读完成，共 ${results.length} 页`);
  return results;
}

// ==================== 主入口 ====================

export async function ingestFile(filePath: string, filename: string): Promise<number> {
  try {
    console.log(`📄 开始多模态处理文件: ${filename}`);

    const parsed = await parseFile(filePath);
    const pageInterpretations = await interpretPages(parsed, filename);

    const summaryText = normalizeIngestText(
      pageInterpretations.map((page) => page.text).join("\n\n---\n\n")
    );

    if (!summaryText) {
      throw new Error("文件未解析出可入库内容");
    }

    const textChunks = await splitTextSafely(semanticSplitter, summaryText);
    console.log(`✅ 多模态解读文本分割完成，共 ${textChunks.length} 个块`);

    const chunks: DocumentChunk[] = [];

    textChunks.forEach((item, idx) => {
      chunks.push({
        pageContent: item.text,
        metadata: {
          source: filePath,
          filename,
          chunkIndex: chunks.length,
          type: "text",
        },
      });
    });

    const pageImageChunks: DocumentChunk[] = pageInterpretations.map((page, index) => ({
      pageContent: page.text,
      imageContent: page.dataUrl,
      metadata: {
        source: filePath,
        filename,
        chunkIndex: chunks.length + index,
        type: "page",
      },
    }));

    const allChunks = [...chunks, ...pageImageChunks];
    console.log(
      `📦 生成 ${chunks.length} 个解读文本块 + ${pageImageChunks.length} 个页面图引用块`
    );

    const count = await vectorStore.addDocuments(allChunks);
    console.log(`✅ 文件处理完成: ${filename}，共 ${count} 个块入库`);

    await fs.unlink(filePath);
    return count;
  } catch (error) {
    console.error(`❌ 文件处理失败: ${filename}`, error);
    try {
      await fs.unlink(filePath);
    } catch {}
    throw error;
  }
}
