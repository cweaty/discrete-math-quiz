// GET Global Leaderboard API

export async function onRequestGet(context) {
  const { env } = context;
  const db = env.DB_KV;
  
  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare KV Namespace binding 'DB_KV' is missing!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    const leaderboardData = await db.get("leaderboard:global");
    
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
