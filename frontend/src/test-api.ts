// 测试 API 调用
export async function testChatAPI() {
  console.log("开始测试 API...");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "你好", history: [] }),
    });

    console.log("响应状态:", response.status);
    console.log("响应头:", response.headers);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("无法获取 reader");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let totalContent = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        console.log("读取完成");
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      console.log("收到原始数据:", chunk);

      buffer += chunk;
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            console.log("解析后的数据:", data);

            if (data.type === "content") {
              totalContent += data.content;
              console.log("当前内容:", totalContent);
            }
          } catch (e) {
            console.error("解析 JSON 失败:", e, "原始行:", line);
          }
        }
      }
    }

    console.log("最终内容:", totalContent);
    return totalContent;
  } catch (error) {
    console.error("测试失败:", error);
    throw error;
  }
}

// 在浏览器控制台中运行: window.testChatAPI()
if (typeof window !== "undefined") {
  (window as any).testChatAPI = testChatAPI;
}
