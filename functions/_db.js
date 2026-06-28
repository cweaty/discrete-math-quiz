// Database abstraction helper to support transparent migration and dual-writing between KV and R2.
// KV Free: 1,000 writes/day, 100k reads/day
// R2 Free: 1M Class A (writes)/month (~33k/day), 10M Class B (reads)/month (~330k/day)
// R2 is 33 times more generous for writes, making it ideal for progress sync and comments.

export async function getDb(env, key) {
  // 1. Try reading from R2 first
  if (env.DB_R2) {
    try {
      const obj = await env.DB_R2.get(key);
      if (obj) {
        return await obj.text();
      }
    } catch (err) {
      console.error("R2 read error for key:", key, err);
    }
  }

  // 2. Fallback to KV
  if (env.DB_KV) {
    try {
      const val = await env.DB_KV.get(key);
      if (val) {
        // Transparently migrate to R2
        if (env.DB_R2) {
          try {
            await env.DB_R2.put(key, val);
            console.log(`Successfully migrated key ${key} from KV to R2.`);
          } catch (migrateErr) {
            console.error("R2 migration write error for key:", key, migrateErr);
          }
        }
        return val;
      }
    } catch (err) {
      console.error("KV read error for key:", key, err);
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
