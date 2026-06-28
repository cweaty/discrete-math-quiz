// Cloudflare Workers/Pages Usage Queries Worker API

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { accountId, apiToken, scriptName } = await request.json();
    
    if (!accountId || !apiToken) {
      return new Response(JSON.stringify({ error: "Cloudflare Account ID 和 API Token 不能为空！" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Get current date/time details in UTC
    const now = new Date();
    const utcYear = now.getUTCFullYear();
    const utcMonth = now.getUTCMonth();
    const utcDate = now.getUTCDate();
    
    // Today UTC range start and end (Daily quota resets at midnight UTC)
    const datetimeStart = new Date(Date.UTC(utcYear, utcMonth, utcDate, 0, 0, 0)).toISOString();
    const datetimeEnd = new Date(Date.UTC(utcYear, utcMonth, utcDate, 23, 59, 59)).toISOString();
    
    // GraphQL query to query workersInvocationsAdaptive
    const query = `
      query GetWorkersAnalytics($accountTag: String!, $datetimeStart: String!, $datetimeEnd: String!) {
        viewer {
          accounts(filter: {accountTag: $accountTag}) {
            workersInvocationsAdaptive(
              limit: 10000,
              filter: {
                datetime_geq: $datetimeStart,
                datetime_leq: $datetimeEnd
              }
            ) {
              sum {
                requests
              }
              dimensions {
                scriptName
              }
            }
          }
        }
      }
    `;
    
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        variables: {
          accountTag: accountId,
          datetimeStart,
          datetimeEnd
        }
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Cloudflare API 返回错误: ${response.status} - ${errText}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const result = await response.json();
    if (result.errors && result.errors.length > 0) {
      return new Response(JSON.stringify({ error: result.errors[0].message }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const accounts = result.data?.viewer?.accounts;
    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ error: "未找到对应的 Account ID 账户，请确保 Token 具有 Account Analytics: Read 权限。" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const invocations = accounts[0].workersInvocationsAdaptive || [];
    
    let workersRequests = 0;
    let pagesRequests = 0;
    
    // Target Pages project script name (fallback to discrete-math-quiz)
    const targetScript = scriptName || "discrete-math-quiz";
    
    invocations.forEach(item => {
      const name = item.dimensions?.scriptName || "";
      const count = item.sum?.requests || 0;
      
      // Determine if Pages or Workers
      if (name === targetScript || name.includes("pages-fn") || name.includes("discrete-math")) {
        pagesRequests += count;
      } else {
        workersRequests += count;
      }
    });
    
    const totalRequests = workersRequests + pagesRequests;
    
    // Calculate seconds remaining until next reset (UTC midnight / Beijing 8:00 AM next day)
    const nextReset = new Date(Date.UTC(utcYear, utcMonth, utcDate + 1, 0, 0, 0));
    const secondsRemaining = Math.max(0, Math.floor((nextReset.getTime() - now.getTime()) / 1000));
    
    return new Response(JSON.stringify({
      workersRequests,
      pagesRequests,
      totalRequests,
      quota: 100000,
      secondsRemaining
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (err) {
    return new Response(JSON.stringify({ error: "查询使用情况失败: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
