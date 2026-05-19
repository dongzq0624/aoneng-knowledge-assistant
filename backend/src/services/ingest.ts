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

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

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

  if (provider === "qwen") {
    return {
      apiKey: config.qwenApiKey || process.env.QWEN_API_KEY || "",
      baseURL:
        config.qwenBaseUrl ||
        process.env.QWEN_BASE_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: config.visionModel || config.generationModel || "qwen-vl-plus",
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
      model: config.visionModel || "glm-4v-flash",
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

async function interpretPages(parsed: ParsedResult, filename: string): Promise<PageInterpretation[]> {
  if (parsed.pages.length === 0) {
    return [];
  }

  const config = await loadVisionConfig();
  console.log(`👁️ 使用视觉模型进行整页理解: ${config.model}`);

  const results: PageInterpretation[] = [];
  for (const page of parsed.pages) {
    try {
      results.push(await interpretPage(config, page, filename, parsed.pages.length));
    } catch (error) {
      console.error(`❌ 第 ${page.pageNumber} 页视觉解读失败:`, error);
      const fallback = page.textHint || parsed.fallbackText || "[页面视觉解读失败，且没有可用文本]";
      results.push({
        pageNumber: page.pageNumber,
        text: `# ${filename} - 第 ${page.pageNumber} 页多模态解读\n\n【页面摘要】\n${fallback}\n\n【图表/表格/截图解读】\n视觉模型调用失败。\n\n【关键数据】\n请参考页面文本候选。`,
        dataUrl: page.dataUrl,
      });
    }
  }

  return results;
}

// ==================== 主入口 ====================

export async function ingestFile(filePath: string, filename: string): Promise<number> {
  try {
    console.log(`📄 开始多模态处理文件: ${filename}`);

    const parsed = await parseFile(filePath);
    const pageInterpretations = await interpretPages(parsed, filename);

    let enhancedText = "";

    if (pageInterpretations.length > 0) {
      enhancedText = pageInterpretations.map((page) => page.text).join("\n\n---\n\n");
    } else {
      enhancedText = parsed.fallbackText;
    }

    if (!enhancedText.trim()) {
      throw new Error("文件未解析出可入库内容");
    }

    const splits = await textSplitter.splitText(enhancedText);
    console.log(`✅ 多模态解读文本分割完成，共 ${splits.length} 个块`);

    const chunks: DocumentChunk[] = splits.map((text, index) => ({
      pageContent: text,
      metadata: {
        source: filePath,
        filename,
        chunkIndex: index,
        type: "text",
      },
    }));

    const pageImageChunks: DocumentChunk[] = pageInterpretations.map((page, index) => ({
      pageContent: page.text,
      imageContent: page.dataUrl,
      metadata: {
        source: filePath,
        filename,
        chunkIndex: splits.length + index,
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
