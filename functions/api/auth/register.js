// Signup Worker API for Cloudflare KV

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
  const db = env.DB_KV; // Binding must be named DB_KV
  
  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare KV Namespace binding 'DB_KV' is missing!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    const { email, username, password } = await request.json();
    
    if (!email || !username || !password) {
      return new Response(JSON.stringify({ error: "邮箱、用户名或密码不能为空！" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Normalization
    const normEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();
    
    // Check if account already exists
    const existingAccount = await db.get(`user:account:${normEmail}`);
    if (existingAccount) {
      return new Response(JSON.stringify({ error: "该邮箱已被注册！" }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Generate salt and hash password
    const salt = generateRandomSalt();
    const passwordHash = await hashPassword(password, salt);
    const userId = `usr_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    
    // Save account index
    const accountData = {
      userId,
      passwordHash,
      salt
    };
    await db.put(`user:account:${normEmail}`, JSON.stringify(accountData));
    
    // Create initial user profile
    const profileData = {
      userId,
      username: cleanUsername,
      email: normEmail,
      answeredCount: 0,
      correctRate: 0,
      examHighScore: 0,
      updatedAt: Math.floor(Date.now() / 1000)
    };
    await db.put(`user:profile:${userId}`, JSON.stringify(profileData));
    
    // Create initial empty progress data
    const progressData = {
      bookmarks: [],
      answered: {}
    };
    await db.put(`user:data:${userId}`, JSON.stringify(progressData));
    
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
