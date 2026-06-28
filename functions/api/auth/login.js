// Login Worker API with JWT Generation for Cloudflare KV (Username & Password Only)

const textEncoder = new TextEncoder();

async function hashPassword(password, salt) {
  const saltedPassword = password + salt;
  const msgUint8 = textEncoder.encode(saltedPassword);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(str) {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  const sigStr = sigArray.map(b => String.fromCharCode(b)).join("");
  return base64UrlEncode(sigStr);
}

async function generateJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHmacSha256(secret, data);
  return `${data}.${signature}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB_KV;
  
  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare KV Namespace binding 'DB_KV' is missing!" }), {
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
    const accountStr = await db.get(`user:account:${normUsername}`);
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
    const profileStr = await db.get(`user:profile:${userId}`);
    const profile = JSON.parse(profileStr);
    
    // Read user data
    const dataStr = await db.get(`user:data:${userId}`);
    const data = JSON.parse(dataStr);
    
    // Generate JWT (expires in 7 days)
    const secret = env.JWT_SECRET || "local_dev_secret_key_12345";
    const payload = {
      userId,
      username: profile.username,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    };
    
    const token = await generateJwt(payload, secret);
    
    return new Response(JSON.stringify({
      message: "登录成功！",
      token,
      profile,
      data
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
