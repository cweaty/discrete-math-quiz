import { putDb } from "../../_db.js";

// Helper to verify admin permissions
function verifyAdmin(context) {
  const user = context.data.user;
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "未授权的操作，仅管理员可用！" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  return null;
}

// POST /api/admin/questions
// Save/Overwrite the custom question pool
export async function onRequestPost(context) {
  const authError = verifyAdmin(context);
  if (authError) return authError;

  const { request, env } = context;
  try {
    const { action, questions } = await request.json();
    
    if (action !== "saveAll" || !Array.isArray(questions)) {
      return new Response(JSON.stringify({ error: "无效的动作或数据格式错误！" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Save to KV/R2 custom pool
    await putDb(env, "questions:custom", JSON.stringify(questions));
    
    return new Response(JSON.stringify({ message: "题库保存成功，已同步至云端缓存！", count: questions.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "保存题库失败: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
