// Database abstraction helper to support transparent migration and dual-writing between KV and R2.
// KV Free: 1,000 writes/day, 100k reads/day
// R2 Free: 1M Class A (writes)/month (~33k/day), 10M Class B (reads)/month (~330k/day)
// R2 is 33 times more generous for writes, making it ideal for progress sync and comments.

export async function getDb(env, key) {
  // 1. Try reading from KV first (edge-cached, low latency)
  if (env.DB_KV) {
    try {
      const val = await env.DB_KV.get(key);
      if (val !== null) {
        return val;
      }
    } catch (err) {
      console.error("KV read error for key:", key, err);
    }
  }

  // 2. Fallback to R2 (durable backing store)
  if (env.DB_R2) {
    try {
      const obj = await env.DB_R2.get(key);
      if (obj) {
        const textVal = await obj.text();
        // Populate back into KV for low-latency future reads
        if (env.DB_KV) {
          try {
            await env.DB_KV.put(key, textVal);
            console.log(`Successfully cached key ${key} from R2 to KV.`);
          } catch (kvErr) {
            console.error("KV caching error for key:", key, kvErr);
          }
        }
        return textVal;
      }
    } catch (err) {
      console.error("R2 read error for key:", key, err);
    }
  }

  return null;
}

export async function putDb(env, key, value) {
  // Always write to R2
  if (env.DB_R2) {
    try {
      await env.DB_R2.put(key, value);
    } catch (err) {
      console.error("R2 write error for key:", key, err);
    }
  }
  // Write to KV as backup/sync
  if (env.DB_KV) {
    try {
      await env.DB_KV.put(key, value);
    } catch (err) {
      console.error("KV write error for key:", key, err);
    }
  }
  
  // Safety check: ensure at least one database is active
  if (!env.DB_R2 && !env.DB_KV) {
    throw new Error("No database binding found ('DB_R2' or 'DB_KV')");
  }
}

export async function deleteDb(env, key) {
  if (env.DB_R2) {
    try {
      await env.DB_R2.delete(key);
    } catch (err) {
      console.error("R2 delete error for key:", key, err);
    }
  }
  if (env.DB_KV) {
    try {
      await env.DB_KV.delete(key);
    } catch (err) {
      console.error("KV delete error for key:", key, err);
    }
  }
}

export async function listDbKeys(env, prefix) {
  if (env.DB_KV) {
    try {
      const res = await env.DB_KV.list({ prefix });
      return res.keys.map(k => k.name);
    } catch (err) {
      console.error("KV list error with prefix:", prefix, err);
    }
  }
  if (env.DB_R2) {
    try {
      const res = await env.DB_R2.list({ prefix });
      return res.objects.map(o => o.key);
    } catch (err) {
      console.error("R2 list error with prefix:", prefix, err);
    }
  }
  return [];
}
