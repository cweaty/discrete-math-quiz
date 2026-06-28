// Delete/Cancel Account worker endpoint

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const db = env.DB_KV;
  const user = data.user; // Attached by authentication middleware
  
  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare KV Namespace binding 'DB_KV' is missing!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  if (!user) {
    return new Response(JSON.stringify({ error: "未授权的操作！" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    const userId = user.userId;
    const username = user.username;
    const normUsername = username.trim().toLowerCase();
    
    // 1. Delete Account Index
    await db.delete(`user:account:${normUsername}`);
    
    // 2. Delete User Profile
    await db.delete(`user:profile:${userId}`);
    
    // 3. Delete User Progress Data
    await db.delete(`user:data:${userId}`);
    
    // 4. Remove User from Global Leaderboard
    const leaderboardStr = await db.get("leaderboard:global");
    if (leaderboardStr) {
      let leaderboard = JSON.parse(leaderboardStr);
      leaderboard = leaderboard.filter(item => item.userId !== userId);
      await db.put("leaderboard:global", JSON.stringify(leaderboard));
    }
    
    return new Response(JSON.stringify({ message: "您的账号及所有云端刷题记录已成功注销并永久抹除！" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: "注销账户处理失败: " + e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
