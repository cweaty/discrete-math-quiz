import { getDb, putDb, listDbKeys } from "../../_db.js";

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

export async function onRequestPost(context) {
  const authError = verifyAdmin(context);
  if (authError) return authError;

  const { env } = context;
  try {
    const keys = await listDbKeys(env, "comments:");
    const log = [];
    
    for (const key of keys) {
      const valStr = await getDb(env, key);
      if (valStr) {
        let comments = JSON.parse(valStr);
        if (Array.isArray(comments)) {
          const originalLen = comments.length;
          comments = comments.filter(c => {
            const uname = c.username || "";
            const content = c.content || "";
            const isTargetUser = (uname === "cweat0504@gmail.com");
            const isTargetText = (content === "你好");
            
            if (isTargetUser && isTargetText) {
              log.push({ key, removed: c });
              return false;
            }
            return true;
          });
          
          if (comments.length < originalLen) {
            await putDb(env, key, JSON.stringify(comments));
          }
        }
      }
    }
    
    return new Response(JSON.stringify({ message: "清理完成！", log }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "清理失败: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
