import fs from 'node:fs';
import path from 'node:path';
import { serverEnv } from './env.js';

export function createFileStore(options = {}) {
  const filePath = path.resolve(options.path || serverEnv('NIBGATE_ADMIN_STORE_PATH') || './nibgate-settings.json');

  function read() {
    try {
      if (!fs.existsSync(filePath)) return {};
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  function write(data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  return {
    list() {
      const data = read();
      return Object.entries(data).map(([id, settings]) => ({ id, ...settings }));
    },
    get(id) {
      const data = read();
      return data[id] || null;
    },
    set(id, settings) {
      const data = read();
      data[id] = { ...(data[id] || {}), ...settings, updatedAt: new Date().toISOString() };
      write(data);
      return data[id];
    },
    remove(id) {
      const data = read();
      delete data[id];
      write(data);
      return true;
    }
  };
}

export function createMemoryStore() {
  const store = {};
  return {
    list() {
      return Object.entries(store).map(([id, settings]) => ({ id, ...settings }));
    },
    get(id) { return store[id] || null; },
    set(id, settings) {
      store[id] = { ...(store[id] || {}), ...settings, updatedAt: new Date().toISOString() };
      return store[id];
    },
    remove(id) { delete store[id]; return true; }
  };
}

export function createPostgresStore(pool, options = {}) {
  const table = options.table || 'nibgate_settings';
  const idColumn = options.idColumn || 'id';

  async function ensureTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${table}" (
        "${idColumn}" TEXT PRIMARY KEY,
        "settings" JSONB NOT NULL DEFAULT '{}',
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async function list() {
    const { rows } = await pool.query(`SELECT "${idColumn}" as id, settings FROM "${table}" ORDER BY "updatedAt" DESC`);
    return rows.map((row) => ({ id: row.id, ...row.settings }));
  }

  async function get(id) {
    const { rows } = await pool.query(`SELECT settings FROM "${table}" WHERE "${idColumn}" = $1`, [id]);
    if (!rows.length) return null;
    return { id, ...rows[0].settings };
  }

  async function set(id, settings) {
    const now = new Date().toISOString();
    const merged = JSON.stringify({ ...settings, updatedAt: now });
    await pool.query(`
      INSERT INTO "${table}" ("${idColumn}", "settings", "updatedAt")
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT ("${idColumn}")
      DO UPDATE SET "settings" = ("${table}"."settings" || $2::jsonb), "updatedAt" = $3
    `, [id, merged, now]);
    return { id, ...settings, updatedAt: now };
  }

  async function remove(id) {
    await pool.query(`DELETE FROM "${table}" WHERE "${idColumn}" = $1`, [id]);
    return true;
  }

  const store = { list, get, set, remove };
  if (options.autoInit !== false) ensureTable().catch(() => {});
  return store;
}
