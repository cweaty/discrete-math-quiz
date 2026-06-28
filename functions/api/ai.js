// Cloudflare Workers AI Math Tutor API for Pages Functions

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { question, analysis, userQuery, model, history } = await request.json();
    
    if (!question) {
      return new Response(JSON.stringify({ error: "Missing parameter 'question'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Choose model (default to llama-3.1-8b-instruct-fast if not provided)
    const activeModel = model || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    
    // Check if Cloudflare AI binding is available
    if (!env.AI) {
      // Mock Response for local dev if AI binding is not configured
      const mockReply = `【本地开发模式 - 模拟AI助教回复】\n\n您使用的是模型：\`${activeModel}\`\n\n关于您提问的疑问：\n> **疑问**：${userQuery}\n\n**解答**：在离散数学中，这是一个经典逻辑命题问题。公式的展开需要严格遵循分配律与德·摩根定律。例如对条件联结词进行等价变换：$A \\rightarrow B \\Leftrightarrow \\neg A \\vee B$。若您在 Cloudflare 部署时绑定了 Workers AI 命名空间，我将通过此模型实时为您进行智能推导解答！`;
      
      const mockUsage = {
        prompt_tokens: Math.round(userQuery.length * 0.4 + question.length * 0.2 + 100),
        completion_tokens: Math.round(mockReply.length * 0.4),
        total_tokens: Math.round(userQuery.length * 0.4 + question.length * 0.2 + 100 + mockReply.length * 0.4)
      };
      
      return new Response(JSON.stringify({ response: mockReply, usage: mockUsage }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Cloudflare Workers AI system prompt and messages
    const systemPrompt = "你是一位资深的大学离散数学AI教授。请针对学生发出的题目、参考解析以及具体的疑问，给出严谨、学术、简洁且专业的中文解答。所有数学公式必须使用 LaTeX 格式（用单美元符号 $ 包裹，如 $p \\wedge q$）。";
    
    // Construct multi-turn messages
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `题目背景：\n${question}\n\n参考解析：\n${analysis || "无"}` },
      { role: "assistant", content: "收到题目上下文。请问您对这道题有什么具体疑问吗？" }
    ];
    
    if (history && Array.isArray(history)) {
      messages.push(...history);
    } else {
      messages.push({ role: "user", content: userQuery });
    }
    
    const response = await env.AI.run(activeModel, {
      messages: messages
    });
    
    const replyText = response.response || response.text || "AI 助教暂时走神了，请稍后重试！";
    const usage = response.usage || {
      prompt_tokens: Math.round(JSON.stringify(messages).length * 0.25),
      completion_tokens: Math.round(replyText.length * 0.25),
      total_tokens: Math.round((JSON.stringify(messages).length + replyText.length) * 0.25)
    };
    
    return new Response(JSON.stringify({ response: replyText, usage: usage }), {
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
