// Cloudflare Workers API for Q&A Comments on Questions

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB_KV;
  
  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare KV Namespace binding 'DB_KV' is missing!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  const url = new URL(request.url);
  const qId = url.searchParams.get("q");
  if (!qId) {
    return new Response(JSON.stringify({ error: "Missing parameter 'q'" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    const commentsData = await db.get(`comments:${qId}`);
    return new Response(commentsData || "[]", {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const db = env.DB_KV;
  const user = data.user; // Set by Auth middleware
  
  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare KV Namespace binding 'DB_KV' is missing!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    const { qId, content } = await request.json();
    if (!qId || !content || !content.trim()) {
      return new Response(JSON.stringify({ error: "内容或题目ID不能为空！" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Read current comments
    const commentsStr = await db.get(`comments:${qId}`);
    const comments = commentsStr ? JSON.parse(commentsStr) : [];
    
    // Append new comment
    comments.push({
      username: user.username,
      content: content.trim(),
      timestamp: Date.now()
    });
    
    // Limit to last 50 comments to keep it clean
    const recentComments = comments.slice(-50);
    
    await db.put(`comments:${qId}`, JSON.stringify(recentComments));
    
    return new Response(JSON.stringify({
      message: "发布成功！",
      comments: recentComments
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
