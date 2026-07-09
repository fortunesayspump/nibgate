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
