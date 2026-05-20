import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.QWEN_API_KEY || "sk-fea8e3a74afc487096ad0b72fffb976f";

async function main() {
  // This script targets DashScope's native multimodal embedding endpoint.
  // It is different from the OpenAI-compatible /embeddings API used in the app.
  const url = "https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding";
  
  const textResponse = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: "qwen3-vl-embedding",
      input: {
        contents: [
          { text: "测试文本" }
        ]
      }
    })
  });
  
  const textData = await textResponse.json();
  const dimension = textData.output.embeddings[0].embedding.length;
  console.log("Embedding dimension:", dimension);
}

main().catch(console.error);
