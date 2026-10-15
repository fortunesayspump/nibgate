const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const servicePath = path.join(__dirname, '../src/services/blog.service.js');

function loadService({ failUpdate = false } = {}) {
  const deleted = [];
  const writes = [];
  let updateData;
  const existing = {
    id: 'post-1', siteId: 'site-1', title: 'Old title', slug: 'old-title',
    bodyStorageRef: 'old-body', contentKey: 'old-key', bodyMarkdown: '',
    videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    audioUrl: 'https://example.com/audio.mp3',
    documentUrl: 'https://example.com/document.pdf',
    publicAccess: true, whitelist: [], price: null,
  };
  const prisma = {
    blogPost: {
      findFirst: async () => existing,
      update: async ({ data }) => {
        updateData = data;
        if (failUpdate) throw new Error('database write failed');
        return { ...existing, ...data };
      },
    },
  };
  const sdk = {
    generateContentKey: () => Buffer.alloc(32),
    encryptBytes: (_key, data) => data,
    packCipherBlob: (data) => data,
    putBlob: async () => {
      writes.push('new-body');
      return { storageRef: 'new-body' };
    },
    deleteBlob: async ({ storageRef }) => { deleted.push(storageRef); },
  };
  const dependencies = {
    'http-status': { status: { NOT_FOUND: 404, FORBIDDEN: 403 } },
    '../utils/ApiError': Error,
    '../lib/prisma': prisma,
    '../config/config': { r2: { endpoint: 'https://r2.example' } },
    '../lib/storage': { registerR2Provider: () => {} },
    '@nibgate/sdk/server': sdk,
    '../lib/keywrap': { wrapContentKey: () => 'wrapped-key' },
    './access.service': { normalizeWhitelist: () => [] },
  };
  const context = {
    require: (name) => dependencies[name] ?? require(name),
    module: { exports: {} },
    Buffer,
    Date,
  };
  vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), context, { filename: servicePath });
  return { service: context.module.exports, deleted, writes, getUpdateData: () => updateData };
}

test('metadata edit leaves the existing encrypted body and media URLs alone', async () => {
  const { service, deleted, writes, getUpdateData } = loadService();
  await service.update('site-1', 'post-1', { title: 'New title' }, null);
  const data = getUpdateData();
  assert.equal(data.title, 'New title');
  for (const field of ['bodyStorageRef', 'videoUrl', 'audioUrl', 'documentUrl']) {
    assert.equal(Object.hasOwn(data, field), false, `${field} should not change`);
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(deleted, []);
});

test('failed body edit removes only the replacement blob', async () => {
  const { service, deleted, writes } = loadService({ failUpdate: true });
  await assert.rejects(service.update('site-1', 'post-1', { bodyMarkdown: 'New body' }, null), /database write failed/);
  assert.deepEqual(writes, ['new-body']);
  assert.deepEqual(deleted, ['new-body']);
});

test('successful body edit removes the old blob after saving its replacement', async () => {
  const { service, deleted, writes, getUpdateData } = loadService();
  await service.update('site-1', 'post-1', { bodyMarkdown: 'New body' }, null);
  assert.equal(getUpdateData().bodyStorageRef, 'new-body');
  assert.deepEqual(writes, ['new-body']);
  assert.deepEqual(deleted, ['old-body']);
});
