import { getDb, putDb } from "../../_db.js";

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

// GET /api/admin/system
// Get system configurations
export async function onRequestGet(context) {
  const authError = verifyAdmin(context);
  if (authError) return authError;

  const { env } = context;
  try {
    const configStr = await getDb(env, "system:config");
    const defaultConfig = {
      defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      defaultIntensity: "medium",
      forceShowThinking: false
    };
    
    const config = configStr ? JSON.parse(configStr) : defaultConfig;
    return new Response(JSON.stringify(config), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "获取系统配置失败: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// POST /api/admin/system
// Save system configurations
export async function onRequestPost(context) {
  const authError = verifyAdmin(context);
  if (authError) return authError;

  const { request, env } = context;
  try {
    const newConfig = await request.json();
    
    // Validate keys
    if (!newConfig.defaultModel || !newConfig.defaultIntensity) {
      return new Response(JSON.stringify({ error: "缺少必要配置参数！" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    await putDb(env, "system:config", JSON.stringify(newConfig));
    
    return new Response(JSON.stringify({ message: "系统与AI配置更新成功！", config: newConfig }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "更新系统配置失败: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
