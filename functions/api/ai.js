// Cloudflare Workers AI Math Tutor API for Pages Functions

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { question, analysis, answer, userQuery, model, history, thinkingIntensity, stream, userRecord } = await request.json();
    
    if (!question) {
      return new Response(JSON.stringify({ error: "Missing parameter 'question'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Choose model (default to llama-3.3-70b-instruct-fp8-fast if not provided)
    const activeModel = model || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    
    // Adjust system prompt depending on chosen intensity
    let intensityPrompt = "";
    if (thinkingIntensity === "low") {
      intensityPrompt = "\n【思考强度要求】：请直接给出非常简练直接的解答与结果，尽可能省略冗长的推导推算，且无需进行 <think> 思考。";
    } else if (thinkingIntensity === "high") {
      intensityPrompt = "\n【思考强度要求】：进行极致严谨、一步一推演的深度逻辑思维链推导，详尽列出每一步推理所依据的离散数学定理与命题条件。请务必将你这部分极其详尽的思考推导过程完整包裹在 <think> 和 </think> 标签中，放在回答的最前面。正文回答部分放在 </think> 之后。";
    } else {
      intensityPrompt = "\n【思考强度要求】：请将你的分析与推导思路完整包裹在 <think> 和 </think> 标签中，放在回答的最前面。正文回答部分放在 </think> 之后。";
    }

    let studentAnswerContext = "";
    const cleanAnswer = answer || "未提供";
    
    if (userRecord) {
      if (userRecord.isCorrect) {
        studentAnswerContext = `\n【学生作答反馈】：该学生已完成作答，提交的答案为："${userRecord.userAns}"，系统判定为【回答正确】（本题的官方标准答案是："${cleanAnswer}"）。在解答中，请首先简单肯定学生的作答思路，并直接针对学生的提问做出解答或做一些知识点拓展。`;
      } else {
        studentAnswerContext = `\n【学生作答反馈】：该学生已完成作答，提交的答案为："${userRecord.userAns}"，系统判定为【回答错误】（本题的官方标准答案是："${cleanAnswer}"）。在解答中，请以温和鼓励的语气开始，对比并指出学生所填写的答案与官方标准答案之间的逻辑或概念偏差，引导其完成纠偏，随后具体回答其疑问。`;
      }
    } else {
      studentAnswerContext = `\n// 特别要求：为了学生的学习效果，你【绝对不能】直接向学生剧透这道题目的标准答案。你必须在内心已知正确答案的前提下，设计一系列循序渐进的引导提问（即苏格拉底教学法），帮助学生分析题意，引导其自主计算得出结果。`;
    }

    const systemPrompt = `你是一位严谨的大学离散数学AI教授与高水平助教。请针对给出的题目、参考答案、参考解析以及学生的具体疑问，给出严谨、学术、简洁且专业的中文解答。
【本题官方参考答案】：${cleanAnswer}
【本题官方参考解析】：${analysis || "无"}

${intensityPrompt}
${studentAnswerContext}

【公式排版规范】：所有的数学公式、符号（包括单个命题变元如 p、q，集合 A、B 等）必须严格使用 LaTeX 格式包裹（行内公式用单美元符号 $，如 $p \\wedge q$；独立行公式用双美元符号 $$），禁止直接输出无格式的普通文本字母公式。`;
    
    // Construct multi-turn messages
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `题目背景：\n${question}` },
      { role: "assistant", content: "收到题目上下文。请问您对这道题有什么具体疑问吗？" }
    ];
    
    if (history && Array.isArray(history)) {
      messages.push(...history);
    } else {
      messages.push({ role: "user", content: userQuery });
    }
    
    // Handle streaming mode
    if (stream) {
      if (!env.AI) {
        // Mock Streaming Response for local development
        const mockReply = `<think>
1. [本地模拟思考] 载入题目背景与参考解析。
2. 识别用户提问并开启流式输出："${userQuery}"。
3. 正在检索知识库... 匹配到“命题逻辑等值演算”、“命题变元”等离散数学知识点。
4. 依据模型 \`${activeModel}\` 拟定逻辑推导链条：德·摩根定律等。
5. 准备以打字机流式输出最终解答。
</think>
【本地开发模式 - 模拟AI助教回复 - 流式打字机效果中】\n\n您使用的是模型：\`${activeModel}\`\n\n关于您提问的疑问：\n> **疑问**：${userQuery}\n\n**解答**：在离散数学中，这是一个经典逻辑命题问题。公式的展开需要严格遵循分配律与德·摩根定律。例如对条件联结词进行等价变换：$A \rightarrow B \Leftrightarrow \neg A \vee B$。若您在 Cloudflare 部署时绑定了 Workers AI 命名空间，我将通过此模型实时为您进行流式智能推导解答！`;

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            // Stream chunk size and delay
            const chunkSize = 20;
            for (let i = 0; i < mockReply.length; i += chunkSize) {
              const chunk = mockReply.substring(i, i + chunkSize);
              const sseEvent = `data: ${JSON.stringify({ response: chunk })}\n\n`;
              controller.enqueue(encoder.encode(sseEvent));
              await new Promise(r => setTimeout(r, 40));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        });
        
        return new Response(readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      
      // Real Cloudflare Workers AI streaming
      const responseStream = await env.AI.run(activeModel, {
        messages: messages,
        stream: true,
        max_tokens: 1800
      });
      
      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    
    // Non-streaming fallback
    if (!env.AI) {
      const mockReply = `<think>
1. [本地模拟思考] 载入题目背景与参考解析。
2. 识别用户提问："${userQuery}"。
3. 正在检索知识库... 匹配到“命题逻辑等值演算”、“命题变元”等离散数学知识点。
4. 依据模型 \`${activeModel}\` 拟定逻辑推导链条：德·摩根定律等。
5. 生成 LaTeX 学术格式回复。
</think>
【本地开发模式 - 模拟AI助教回复】\n\n您使用的是模型：\`${activeModel}\`\n\n关于您提问的疑问：\n> **疑问**：${userQuery}\n\n**解答**：在离散数学中，这是一个经典逻辑命题问题。公式的展开需要严格遵循分配律与德·摩根定律。例如对条件联结词进行等价变换：$A \rightarrow B \Leftrightarrow \neg A \vee B$。若您在 Cloudflare 部署时绑定了 Workers AI 命名空间，我将通过此模型实时为您进行智能推导解答！`;
      
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
    
    const response = await env.AI.run(activeModel, {
      messages: messages,
      max_tokens: 1800
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
