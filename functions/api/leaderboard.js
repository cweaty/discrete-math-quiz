import { getDb } from "../_db.js";
// GET Global Leaderboard API

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB_KV && !env.DB_R2) {
    return new Response(JSON.stringify({ error: "Cloudflare database bindings ('DB_KV' or 'DB_R2') are missing!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    const leaderboardData = await getDb(env, "leaderboard:global");
    
    // Return empty list if not initialized yet
    return new Response(leaderboardData || "[]", {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "获取排行榜失败: " + e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
