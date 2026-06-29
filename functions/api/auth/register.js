import { getDb, putDb } from "../../_db.js";
// Signup Worker API for Cloudflare KV (Username & Password Only)

const textEncoder = new TextEncoder();

async function hashPassword(password, salt) {
  const saltedPassword = password + salt;
  const msgUint8 = textEncoder.encode(saltedPassword);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateRandomSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB_KV && !env.DB_R2) {
    return new Response(JSON.stringify({ error: "Cloudflare database bindings ('DB_KV' or 'DB_R2') are missing!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    const { username, password } = await request.json();
    
    if (!username || !password) {
      return new Response(JSON.stringify({ error: "用户名或密码不能为空！" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Normalization
    const normUsername = username.trim().toLowerCase();
    const cleanUsername = username.trim();
    
    if (normUsername === "admin") {
      return new Response(JSON.stringify({ error: "系统管理员账号禁止公开注册！" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Check if account already exists (key by username now)
    const existingAccount = await getDb(env, `user:account:${normUsername}`);
    if (existingAccount) {
      return new Response(JSON.stringify({ error: "该用户名已被注册！" }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Generate salt and hash password
    const salt = generateRandomSalt();
    const passwordHash = await hashPassword(password, salt);
    const userId = `usr_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    const role = (normUsername === "admin") ? "admin" : "user";
    
    // Save account index
    const accountData = {
      userId,
      passwordHash,
      salt,
      role
    };
    await putDb(env, `user:account:${normUsername}`, JSON.stringify(accountData));
    
    // Create initial user profile
    const profileData = {
      userId,
      username: cleanUsername,
      answeredCount: 0,
      correctRate: 0,
      examHighScore: 0,
      role,
      updatedAt: Math.floor(Date.now() / 1000)
    };
    await putDb(env, `user:profile:${userId}`, JSON.stringify(profileData));
    
    // Create initial empty progress data
    const progressData = {
      bookmarks: [],
      answered: {}
    };
    await putDb(env, `user:data:${userId}`, JSON.stringify(progressData));
    
    return new Response(JSON.stringify({ message: "注册成功！现在可以进行登录。" }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: "注册处理失败: " + e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
