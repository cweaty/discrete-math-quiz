// Cloudflare Workers AI Math Tutor API for Pages Functions

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { question, analysis, userQuery } = await request.json();
    
    if (!question) {
      return new Response(JSON.stringify({ error: "Missing parameter 'question'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Check if Cloudflare AI binding is available
    if (!env.AI) {
      // Mock Response for local dev if AI binding is not configured
      const mockReply = `【本地开发模式 - 模拟AI助教回复】\n\n您关于以下题目的提问：\n> **题目**：${question.substring(0, 80)}...\n> **疑问**：${userQuery}\n\n**解答**：在离散数学中，这是一个经典逻辑命题问题。公式的展开需要严格遵循分配律与德·摩根定律。例如对条件联结词进行等价变换：$A \\rightarrow B \\Leftrightarrow \\neg A \\vee B$。若您在 Cloudflare 部署时绑定了 Workers AI 命名空间，我将实时调用 Llama-3 / Qwen 模型为您进行智能推导解答！`;
      
      return new Response(JSON.stringify({ response: mockReply }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Cloudflare Workers AI system prompt and messages
    const systemPrompt = "你是一位资深的大学离散数学AI教授。请针对学生发出的题目、参考解析以及具体的疑问，给出严谨、简洁且专业的中文解答。所有数学公式必须使用 LaTeX 格式（用单美元符号 $ 包裹，如 $p \\wedge q$）。";
    
    const promptMessage = `
题目：
${question}

参考解析：
${analysis || "无"}

学生的具体疑问：
${userQuery}
`;

    // We call Llama-3-8b-instruct or Qwen-1.5-14b-chat on Cloudflare
    // Using Qwen for excellent Chinese logic capability
    const model = "@cf/qwen/qwen1.5-14b-chat"; 
    
    const response = await env.AI.run(model, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptMessage }
      ]
    });
    
    // Cloudflare AI response contains a .response or .text depending on model type
    const replyText = response.response || response.text || "AI 助教暂时走神了，请稍后重试！";
    
    return new Response(JSON.stringify({ response: replyText }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: "AI 助教答疑失败: " + e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
