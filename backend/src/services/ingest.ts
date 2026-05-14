// 文件解析和向量化服务
import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { vectorStore } from "./vectorstore.js";
import type { DocumentChunk } from "../types.js";

// 文本分割器配置
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

// 解析 PDF 文件（使用 pdfjs-dist 直接解析）
async function parsePDF(filePath: string): Promise<string> {
  try {
    const { getDocument } = await import("pdfjs-dist");
    const buffer = await fs.readFile(filePath);
    const pdf = await getDocument({ data: buffer.buffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => item.str).join(" ");
      pages.push(text);
    }

    const fullText = pages.join("\n");
    console.log(`📄 PDF 解析成功: ${pdf.numPages} 页, ${fullText.length} 字符`);
    return fullText;
  } catch (error) {
    console.error("❌ PDF 解析失败:", error);
    throw new Error(
      `PDF 解析失败: ${error instanceof Error ? error.message : "未知错误"}`
    );
  }
}

// 解析 DOCX 文件
async function parseDOCX(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

// 解析 TXT/MD 文件
async function parseText(filePath: string): Promise<string> {
  return await fs.readFile(filePath, "utf-8");
}

// 根据文件类型选择解析器
async function parseFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".pdf":
      return await parsePDF(filePath);
    case ".docx":
      return await parseDOCX(filePath);
    case ".txt":
    case ".md":
      return await parseText(filePath);
    default:
      throw new Error(`不支持的文件类型: ${ext}`);
  }
}

// 处理上传的文件
export async function ingestFile(
  filePath: string,
  filename: string
): Promise<number> {
  try {
    console.log(`📄 开始处理文件: ${filename}`);

    // 1. 解析文件内容
    const text = await parseFile(filePath);
    console.log(`✅ 文件解析完成`);

    // 2. 分割文本
    const splits = await textSplitter.splitText(text);
    console.log(`✅ 文本分割完成，共 ${splits.length} 个块`);

    // 3. 创建文档块
    const chunks: DocumentChunk[] = splits.map((text, index) => ({
      pageContent: text,
      metadata: {
        source: filePath,
        filename: filename,
        chunkIndex: index,
      },
    }));

    // 4. 添加到向量库
    const count = await vectorStore.addDocuments(chunks);
    console.log(`✅ 文件处理完成: ${filename}，共 ${count} 个块`);

    // 5. 删除临时文件
    await fs.unlink(filePath);

    return count;
  } catch (error) {
    console.error(`❌ 文件处理失败: ${filename}`, error);
    // 清理临时文件
    try {
      await fs.unlink(filePath);
    } catch {}
    throw error;
  }
}