import { getDb } from "../_db.js";

// GET /api/questions
// Retrieve the dynamic custom question list from cloud database
export async function onRequestGet(context) {
  const { env } = context;
  
  if (!env.DB_KV && !env.DB_R2) {
    return new Response(JSON.stringify({ error: "Cloudflare database bindings are missing!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const questionsData = await getDb(env, "questions:custom");
    return new Response(questionsData || "[]", {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "加载自定义题库失败: " + e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
