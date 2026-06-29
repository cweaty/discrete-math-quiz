import { getDb, putDb, deleteDb, listDbKeys } from "../../_db.js";
// Delete/Cancel Account worker endpoint

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const user = data.user; // Attached by authentication middleware
  
  if (!env.DB_KV && !env.DB_R2) {
    return new Response(JSON.stringify({ error: "Cloudflare database bindings ('DB_KV' or 'DB_R2') are missing!" }), {
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
    await deleteDb(env, `user:account:${normUsername}`);
    
    // 2. Delete User Profile
    await deleteDb(env, `user:profile:${userId}`);
    
    // 3. Delete User Progress Data
    await deleteDb(env, `user:data:${userId}`);
    
    // 4. Remove User from Global Leaderboard
    const leaderboardStr = await getDb(env, "leaderboard:global");
    if (leaderboardStr) {
      let leaderboard = JSON.parse(leaderboardStr);
      leaderboard = leaderboard.filter(item => item.userId !== userId);
      await putDb(env, "leaderboard:global", JSON.stringify(leaderboard));
    }

    // 5. Delete User's Comments
    try {
      const commentKeys = await listDbKeys(env, "comments:");
      for (const key of commentKeys) {
        const valStr = await getDb(env, key);
        if (valStr) {
          try {
            let comments = JSON.parse(valStr);
            if (Array.isArray(comments)) {
              const originalLen = comments.length;
              comments = comments.filter(c => {
                const uname = c.username || "";
                return uname.trim().toLowerCase() !== normUsername;
              });
              if (comments.length < originalLen) {
                await putDb(env, key, JSON.stringify(comments));
              }
            }
          } catch (parseErr) {
            console.error("Parse error for comment key during deletion:", key, parseErr);
          }
        }
      }
    } catch (commentErr) {
      console.error("Failed to cleanup user comments:", commentErr);
    }
    
    return new Response(JSON.stringify({ message: "您的账号及所有云端刷题记录和讨论回复已成功注销并永久抹除！" }), {
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
