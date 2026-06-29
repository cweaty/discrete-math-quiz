import { getDb, putDb, deleteDb, listDbKeys } from "../../_db.js";

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

// GET /api/admin/users
// Retrieve all registered user profiles
export async function onRequestGet(context) {
  const authError = verifyAdmin(context);
  if (authError) return authError;

  const { env } = context;
  try {
    const keys = await listDbKeys(env, "user:profile:");
    const profiles = [];
    
    // Concurrently fetch all profiles
    const fetchPromises = keys.map(async (key) => {
      const profileStr = await getDb(env, key);
      if (profileStr) {
        try {
          const profile = JSON.parse(profileStr);
          
          // Retrieve role directly from profile
          const normUsername = profile.username.trim().toLowerCase();
          profile.role = profile.role || (normUsername === "admin" ? "admin" : "user");
          
          profiles.push(profile);
        } catch (parseErr) {
          console.error("Parse error for profile key:", key, parseErr);
        }
      }
    });
    
    await Promise.all(fetchPromises);

    // Sort by username
    profiles.sort((a, b) => a.username.localeCompare(b.username));

    return new Response(JSON.stringify(profiles), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "获取用户列表失败: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// POST /api/admin/users
// Admin actions: change role or delete user
export async function onRequestPost(context) {
  const authError = verifyAdmin(context);
  if (authError) return authError;

  const { request, env } = context;
  try {
    const { action, targetUserId, targetUsername, newRole } = await request.json();
    
    if (!action) {
      return new Response(JSON.stringify({ error: "缺少操作动作 'action'！" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (action === "changeRole") {
      if (!targetUsername || !newRole) {
        return new Response(JSON.stringify({ error: "缺少 targetUsername 或 newRole 参数！" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      const normUsername = targetUsername.trim().toLowerCase();
      const accountStr = await getDb(env, `user:account:${normUsername}`);
      if (!accountStr) {
        return new Response(JSON.stringify({ error: "未找到目标用户账号！" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      const account = JSON.parse(accountStr);
      account.role = newRole;
      await putDb(env, `user:account:${normUsername}`, JSON.stringify(account));
      
      // Also update role in profile
      const targetUserId = account.userId;
      const profileStr = await getDb(env, `user:profile:${targetUserId}`);
      if (profileStr) {
        try {
          const profile = JSON.parse(profileStr);
          profile.role = newRole;
          await putDb(env, `user:profile:${targetUserId}`, JSON.stringify(profile));
        } catch (pErr) {
          console.error("Profile role update error:", pErr);
        }
      }
      
      return new Response(JSON.stringify({ message: `用户 ${targetUsername} 角色已修改为 ${newRole}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    if (action === "delete") {
      if (!targetUserId || !targetUsername) {
        return new Response(JSON.stringify({ error: "缺少 targetUserId 或 targetUsername 参数！" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      const normUsername = targetUsername.trim().toLowerCase();
      
      // 1. Delete credentials
      await deleteDb(env, `user:account:${normUsername}`);
      
      // 2. Delete profile
      await deleteDb(env, `user:profile:${targetUserId}`);
      
      // 3. Delete data
      await deleteDb(env, `user:data:${targetUserId}`);
      
      // 4. Remove from Leaderboard
      const leaderboardStr = await getDb(env, "leaderboard:global");
      if (leaderboardStr) {
        try {
          let leaderboard = JSON.parse(leaderboardStr);
          leaderboard = leaderboard.filter(item => item.userId !== targetUserId);
          await putDb(env, "leaderboard:global", JSON.stringify(leaderboard));
        } catch (lErr) {
          console.error("Leaderboard filter error during admin delete:", lErr);
        }
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
              console.error("Parse error for comment key during admin deletion:", key, parseErr);
            }
          }
        }
      } catch (commentErr) {
        console.error("Failed to cleanup user comments during admin deletion:", commentErr);
      }
      
      return new Response(JSON.stringify({ message: `用户 ${targetUsername} 的所有云端数据和讨论区回复已强制注销并彻底清除！` }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: `不支持的操作动作: ${action}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "执行管理操作失败: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
