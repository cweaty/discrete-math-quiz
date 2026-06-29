// Cloudflare Workers AI Math Tutor API for Pages Functions

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const body = await request.json();
    const { question, analysis, answer, userQuery, model, history, thinkingIntensity, stream, userRecord, mode, category, topic } = body;
    
    // ── MODE: enhance_question ──────────────────────────────────────────────────
    // Used by Admin Question Import panel to auto-optimize questions via AI
    if (mode === 'enhance_question') {
      if (!question) {
        return new Response(JSON.stringify({ error: "Missing parameter 'question'" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Default to the highly stable llama-3.3-70b-instruct-fp8-fast model used elsewhere on the site
      const activeModel = model || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

      const enhanceSystemPrompt = `你是一位专业的离散数学题库编辑与LaTeX数学排版专家。你的任务是对给定的题目进行质量优化，并以严格的JSON格式返回结果。

优化与格式规范：
1. 检查并修正题干中所有LaTeX公式语法（行内公式使用 $...$，独立行公式使用 $$...$$）。
2. 如果题干表述不清，进行语义优化（保持题意不变）。
3. 填空题规范：
   - 填空题若有多个空/多个答案，答案部分必须用竖线 '|' 隔开，如 '春 | 夏 | 秋'。
   - 如果填空题只有一个答案，则在题干最前面必须加上 '【填空题】'，如 '【填空题】我国古典四大名著是...'。
4. 判断题规范：
   - 答案必须标准化为 '对' 或 '错' 之一。
5. 选择题规范：
   - 选项列表中，每一个选项文本内容中不能包含字母前缀（如不能包含 'A.'、'A、'、'A) '），仅保留选项文字本身。
6. 解析与答案标记规范：
   - 答案、解析后面在生成段落时要有冒号，例如在解析文本或生成 Markdown 排版中，使用 '答案：'、'解析：'。
   - 解析中如果有公式或逐步推演过程，必须使用标准的 LaTeX 排版。
7. 保持题型(category)和专题(topic)不变，禁止改变题目的标准答案。

返回格式必须是合法JSON（不要包裹在Markdown代码块中，仅返回一个JSON对象）：
{
  "question": "优化后的题干（保留LaTeX格式，单空填空题需包含【填空题】前缀）",
  "options": ["选项A的文本", "选项B的文本", "选项C的文本", "选项D的文本"],
  "answer": "标准答案（判断题为 对/错；多答案填空题用|隔开）",
  "analysis": "完整的逐步解析推导（使用LaTeX格式）",
  "tips": "优化说明（1-2句）"
}`;

      const enhanceMessages = [
        { role: "system", content: enhanceSystemPrompt },
        { role: "user", content: `请优化以下离散数学题目：

题型：${category || '未知'}
专题：${topic || '未知'}
题干：${question}
当前选项：${JSON.stringify(body.options || [])}
当前答案：${answer || '未提供'}
当前解析：${analysis || '（无解析，请根据答案生成完整解析）'}

请按规则优化并以JSON格式返回。` }
      ];

      if (!env.AI) {
        // Local dev mock
        const isSingleBlank = category === 'fill_blank' && !answer.includes('|');
        let formattedQuestion = question;
        if (isSingleBlank && !question.startsWith('【填空题】')) {
          formattedQuestion = '【填空题】' + question;
        }
        const mockResult = {
          question: formattedQuestion,
          options: category === 'single_choice' ? (body.options || ['选项A', '选项B', '选项C', '选项D']) : [],
          answer: answer || (category === 'judgment' ? '对' : '答案'),
          analysis: analysis || `根据题意分析：\n\n解析：\n1. 分析题干条件\n2. 应用相关定理\n3. 得出结论：${answer || '（请填写答案）'}`,
          tips: "【本地开发模式】此为模拟优化结果，部署至 Cloudflare 后将调用真实 AI 进行优化。"
        };
        return new Response(JSON.stringify(mockResult), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // Try running the AI model with multiple fallback options to prevent 500 when specific model goes offline
      let enhanceResponse;
      const modelsToTry = [activeModel, "@cf/qwen/qwq-32b", "@cf/meta/llama-3.1-8b-instruct"];
      let lastError = null;

      for (const currentModel of modelsToTry) {
        try {
          enhanceResponse = await env.AI.run(currentModel, {
            messages: enhanceMessages,
            max_tokens: 2000
          });
          if (enhanceResponse && (enhanceResponse.response || enhanceResponse.text)) {
            break; // Success
          }
        } catch (runErr) {
          console.error(`AI Model execution failed for ${currentModel}: ${runErr.message}`);
          lastError = runErr;
        }
      }

      if (!enhanceResponse) {
        return new Response(JSON.stringify({ 
          error: "AI 服务暂时不可用: " + (lastError ? lastError.message : "未知错误")
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }

      let rawText = enhanceResponse.response || enhanceResponse.text || "";
      
      // Strip markdown code fences if model wrapped JSON
      rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      let parsed = null;
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        // Try to extract JSON object from text
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { 
            parsed = JSON.parse(jsonMatch[0]); 
          } catch (_) {
            console.error("Failed to parse extracted JSON object.");
          }
        }
      }

      // Fallback: If JSON parsing completely fails, do not return a 500 error!
      // Return a structured object with raw text in analysis so the admin can review/edit it manually.
      if (!parsed) {
        parsed = {
          question: question,
          analysis: rawText || "AI 优化解析失败，请点击编辑手动补充。",
          tips: "⚠️ AI 未能按 JSON 格式返回，已将原始输出存入解析中。"
        };
      }

      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }


    // ── MODE: regular AI tutor ─────────────────────────────────────────────────
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
3. 正在检索知识库... 匹配到"命题逻辑等值演算"、"命题变元"等离散数学知识点。
4. 依据模型 \`${activeModel}\` 拟定逻辑推导链条：德·摩根定律等。
5. 准备以打字机流式输出最终解答。
</think>
【本地开发模式 - 模拟AI助教回复 - 流式打字机效果中】\n\n您使用的是模型：\`${activeModel}\`\n\n关于您提问的疑问：\n> **疑问**：${userQuery}\n\n**解答**：在离散数学中，这是一个经典逻辑命题问题。公式的展开需要严格遵循分配律与德·摩根定律。例如对条件联结词进行等价变换：$A \\rightarrow B \\Leftrightarrow \\neg A \\vee B$。若您在 Cloudflare 部署时绑定了 Workers AI 命名空间，我将通过此模型实时为您进行流式智能推导解答！`;

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
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
3. 正在检索知识库... 匹配到"命题逻辑等值演算"、"命题变元"等离散数学知识点。
4. 依据模型 \`${activeModel}\` 拟定逻辑推导链条：德·摩根定律等。
5. 生成 LaTeX 学术格式回复。
</think>
【本地开发模式 - 模拟AI助教回复】\n\n您使用的是模型：\`${activeModel}\`\n\n关于您提问的疑问：\n> **疑问**：${userQuery}\n\n**解答**：在离散数学中，这是一个经典逻辑命题问题。公式的展开需要严格遵循分配律与德·摩根定律。例如对条件联结词进行等价变换：$A \\rightarrow B \\Leftrightarrow \\neg A \\vee B$。若您在 Cloudflare 部署时绑定了 Workers AI 命名空间，我将通过此模型实时为您进行智能推导解答！`;
      
      const mockUsage = {
        prompt_tokens: Math.round((userQuery || '').length * 0.4 + question.length * 0.2 + 100),
        completion_tokens: Math.round(mockReply.length * 0.4),
        total_tokens: Math.round((userQuery || '').length * 0.4 + question.length * 0.2 + 100 + mockReply.length * 0.4)
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
