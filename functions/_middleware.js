// Cloudflare Pages Middleware for JWT Authentication and CORS

// Base64URL encode/decode helpers
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return atob(str);
}

function base64UrlEncode(str) {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Convert text to buffer
const textEncoder = new TextEncoder();

// Import HMAC helper
async function verifyHmacSha256(secret, data, signature) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  
  // Signature in Base64URL is converted back to binary
  const sigBuffer = new Uint8Array(
    base64UrlDecode(signature).split("").map(c => c.charCodeAt(0))
  );
  
  return await crypto.subtle.verify(
    "HMAC",
    key,
    sigBuffer,
    textEncoder.encode(data)
  );
}

// Verify JWT token and attach user to context
async function authenticate(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  
  const [headerStr, payloadStr, signature] = parts;
  const data = `${headerStr}.${payloadStr}`;
  
  const secret = env.JWT_SECRET || "local_dev_secret_key_12345";
  const isValid = await verifyHmacSha256(secret, data, signature);
  if (!isValid) {
    return null;
  }
  
  try {
    const payload = JSON.parse(base64UrlDecode(payloadStr));
    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }
    return payload; // Returns { userId, username, email }
  } catch (e) {
    return null;
  }
}

// Middleware handler
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  
  // Handle CORS Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400"
      }
    });
  }
  
  // Setup CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  
  // Public vs Protected Routes verification
  const isPublicRoute = 
    url.pathname.includes("/api/auth/login") || 
    url.pathname.includes("/api/auth/register") || 
    (url.pathname.includes("/api/leaderboard") && request.method === "GET") ||
    (url.pathname.includes("/api/comments") && request.method === "GET") ||
    url.pathname.includes("/api/ai");
  
  if (url.pathname.includes("/api/") && !isPublicRoute) {
    const user = await authenticate(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: "未登录或登录态失效，请重新登录！" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }
    // Attach user payload to context data
    context.data.user = user;
  }
  
  // Execute route handler
  const response = await next();
  
  // Append CORS headers to response
  const newResponse = new Response(response.body, response);
  Object.keys(corsHeaders).forEach(key => {
    newResponse.headers.set(key, corsHeaders[key]);
  });
  
  return newResponse;
}
