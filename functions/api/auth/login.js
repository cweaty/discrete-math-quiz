import { getDb } from "../../_db.js";
// Login Worker API with JWT Generation for Cloudflare KV (Username & Password Only)

const textEncoder = new TextEncoder();

async function hashPassword(password, salt) {
  const saltedPassword = password + salt;
  const msgUint8 = textEncoder.encode(saltedPassword);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncodeBytes(bytes) {
  let binStr = "";
  for (let i = 0; i < bytes.length; i++) {
    binStr += String.fromCharCode(bytes[i]);
  }
  return btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlEncodeText(str) {
  const bytes = new TextEncoder().encode(str);
  return base64UrlEncodeBytes(bytes);
}

async function signHmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, textEncoder.encode(data));
  return base64UrlEncodeBytes(new Uint8Array(sigBuffer));
}

async function generateJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncodeText(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHmacSha256(secret, data);
  return `${data}.${signature}`;
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
      return new Response(JSON.stringify({ error: "用户名和密码不能为空！" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Normalization
    const normUsername = username.trim().toLowerCase();
    
    // Read Account Index (key by username now)
    let accountStr = await getDb(env, `user:account:${normUsername}`);
    
    // Auto-seed admin account on first login attempt if it doesn't exist
    if (!accountStr && normUsername === "admin") {
      const adminPassword = env.ADMIN_PASSWORD || "admin123";
      const salt = "0123456789abcdef0123456789abcdef"; // Stable salt for admin auto-seed
      const passwordHash = await hashPassword(adminPassword, salt);
      const userId = "usr_admin_000000000";
      
      const accountData = {
        userId,
        passwordHash,
        salt,
        role: "admin"
      };
      await putDb(env, `user:account:admin`, JSON.stringify(accountData));
      
      const profileData = {
        userId,
        username: "admin",
        answeredCount: 0,
        correctRate: 0,
        examHighScore: 0,
        role: "admin",
        updatedAt: Math.floor(Date.now() / 1000)
      };
      await putDb(env, `user:profile:${userId}`, JSON.stringify(profileData));
      
      const progressData = {
        bookmarks: [],
        answered: {}
      };
      await putDb(env, `user:data:${userId}`, JSON.stringify(progressData));
      
      accountStr = JSON.stringify(accountData);
      console.log("Successfully auto-seeded system admin account.");
    }
    
    if (!accountStr) {
      return new Response(JSON.stringify({ error: "用户名不存在或密码错误！" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const account = JSON.parse(accountStr);
    
    // Hash password and verify
    const inputHash = await hashPassword(password, account.salt);
    if (inputHash !== account.passwordHash) {
      return new Response(JSON.stringify({ error: "用户名不存在或密码错误！" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const userId = account.userId;
    
    // Read Profile
    const profileStr = await getDb(env, `user:profile:${userId}`);
    const profile = JSON.parse(profileStr);
    
    // Read user data
    const dataStr = await getDb(env, `user:data:${userId}`);
    const data = JSON.parse(dataStr);
    
    // Generate JWT (expires in 7 days)
    const secret = env.JWT_SECRET || "local_dev_secret_key_12345";
    const payload = {
      userId,
      username: profile.username,
      role: account.role || (normUsername === "admin" ? "admin" : "user"),
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    };
    
    const token = await generateJwt(payload, secret);
    const role = payload.role;
    
    return new Response(JSON.stringify({
      message: "登录成功！",
      token,
      profile,
      data,
      role
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: "登录处理失败: " + e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
