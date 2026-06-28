import { getDb, putDb } from "../_db.js";
// Sync Progress API with Auto Leaderboard Integration for Cloudflare KV

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const db = env.DB_KV;
  const user = data.user; // Attached by middleware
  
  if (!db) {
    return new Response(JSON.stringify({ error: "Cloudflare KV Namespace binding 'DB_KV' is missing!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    const { bookmarks, wrongQuestions, answered, examHighScore } = await request.json();
    const userId = user.userId;
    
    // 1. Read existing profile
    const profileStr = await getDb(env, `user:profile:${userId}`);
    if (!profileStr) {
      return new Response(JSON.stringify({ error: "未找到用户画像资料！" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    const profile = JSON.parse(profileStr);
    
    // 2. Validate input and save detailed data to user:data:{userId}
    const progressData = {
      bookmarks: bookmarks || [],
      wrongQuestions: wrongQuestions || [],
      answered: answered || {}
    };
    await putDb(env, `user:data:${userId}`, JSON.stringify(progressData));
    
    // 3. Compute stats
    const answeredCount = Object.keys(progressData.answered).length;
    let correctCount = 0;
    for (const key in progressData.answered) {
      if (progressData.answered[key].isCorrect) {
        correctCount++;
      }
    }
    const correctRate = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    
    // 4. Update profile stats
    profile.answeredCount = answeredCount;
    profile.correctRate = correctRate;
    
    // Check if it is a complete reset operation
    const isReset = (answeredCount === 0 && progressData.bookmarks.length === 0 && progressData.wrongQuestions.length === 0);
    if (isReset) {
      profile.examHighScore = 0;
    } else if (examHighScore !== undefined) {
      profile.examHighScore = Math.max(profile.examHighScore || 0, examHighScore);
    }
    profile.updatedAt = Math.floor(Date.now() / 1000);
    
    // Save updated profile
    await putDb(env, `user:profile:${userId}`, JSON.stringify(profile));
    
    // 5. Update Global Leaderboard
    const leaderboardStr = await getDb(env, "leaderboard:global");
    let leaderboard = leaderboardStr ? JSON.parse(leaderboardStr) : [];
    
    // Remove user if already exists in leaderboard (to avoid duplicates)
    leaderboard = leaderboard.filter(item => item.userId !== userId);
    
    // Push new entry
    leaderboard.push({
      userId,
      username: profile.username,
      answeredCount: profile.answeredCount,
      examHighScore: profile.examHighScore,
      correctRate: profile.correctRate
    });
    
    // Sort logic:
    // 1. Higher exam high score first
    // 2. More questions answered first
    // 3. Better accuracy rate first
    leaderboard.sort((a, b) => {
      if (b.examHighScore !== a.examHighScore) {
        return b.examHighScore - a.examHighScore;
      }
      if (b.answeredCount !== a.answeredCount) {
        return b.answeredCount - a.answeredCount;
      }
      return b.correctRate - a.correctRate;
    });
    
    // Slice to top 50
    const top50 = leaderboard.slice(0, 50);
    await putDb(env, "leaderboard:global", JSON.stringify(top50));
    
    return new Response(JSON.stringify({
      message: "同步成功！",
      profile,
      leaderboard: top50
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: "同步进度处理失败: " + e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// GET method returns user data and profile
export async function onRequestGet(context) {
  const { env, data } = context;
  const db = env.DB_KV;
  const user = data.user;
  
  if (!db) {
    return new Response(JSON.stringify({ error: "KV DB not found" }), { status: 500 });
  }
  
  try {
    const userId = user.userId;
    const profileStr = await getDb(env, `user:profile:${userId}`);
    const dataStr = await getDb(env, `user:data:${userId}`);
    
    return new Response(JSON.stringify({
      profile: JSON.parse(profileStr || "{}"),
      data: JSON.parse(dataStr || "{\"bookmarks\":[],\"wrongQuestions\":[],\"answered\":{}}")
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
