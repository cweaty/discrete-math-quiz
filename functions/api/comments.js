import { getDb, putDb } from "../_db.js";
// Cloudflare Workers API for Q&A Comments on Questions

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB_KV && !env.DB_R2) {
    return new Response(JSON.stringify({ error: "Cloudflare database bindings ('DB_KV' or 'DB_R2') are missing!" }), {
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
    const commentsData = await getDb(env, `comments:${qId}`);
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
    const commentsStr = await getDb(env, `comments:${qId}`);
    const comments = commentsStr ? JSON.parse(commentsStr) : [];
    
    // Append new comment
    comments.push({
      username: user.username,
      content: content.trim(),
      timestamp: Date.now()
    });
    
    // Limit to last 50 comments to keep it clean
    const recentComments = comments.slice(-50);
    
    await putDb(env, `comments:${qId}`, JSON.stringify(recentComments));
    
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

export async function onRequestDelete(context) {
  const { request, env, data } = context;
  const db = env.DB_KV;
  const user = data.user;
  
  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare KV Namespace binding 'DB_KV' is missing!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  if (!user) {
    return new Response(JSON.stringify({ error: "未登录，无法删除评论！" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    const { qId, timestamp } = await request.json();
    if (!qId || !timestamp) {
      return new Response(JSON.stringify({ error: "参数缺失！" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Clear all shortcut
    if (timestamp === 'all') {
      await putDb(env, `comments:${qId}`, JSON.stringify([]));
      return new Response(JSON.stringify({
        message: "该题目讨论记录已全部删除清空！",
        comments: []
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Read current comments
    const commentsStr = await getDb(env, `comments:${qId}`);
    if (!commentsStr) {
      return new Response(JSON.stringify({ error: "未找到评论记录" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    let comments = JSON.parse(commentsStr);
    const commentIndex = comments.findIndex(c => c.timestamp === timestamp);
    if (commentIndex === -1) {
      return new Response(JSON.stringify({ error: "评论不存在！" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Check ownership
    if (comments[commentIndex].username !== user.username) {
      return new Response(JSON.stringify({ error: "您只能删除自己发表的评论！" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Delete comment
    comments.splice(commentIndex, 1);
    await putDb(env, `comments:${qId}`, JSON.stringify(comments));
    
    return new Response(JSON.stringify({
      message: "评论删除成功！",
      comments: comments
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
