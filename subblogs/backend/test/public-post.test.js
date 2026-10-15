const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicPost } = require('../src/controllers/public-post');

test('public paid-post summaries do not expose encrypted body or media metadata', () => {
  const original = {
    id: 'post-1', title: 'Paid report', price: '0.10', bodyMarkdown: '',
    contentKey: 'wrapped-secret', bodyStorageRef: 'private-body',
    media: JSON.stringify([{ storageRef: 'private-photo', encryptedKey: 'wrapped-photo' }]),
    audioStorageRef: 'private-audio', audioEncryptedKey: 'wrapped-audio',
    videoStorageRef: 'private-video', videoEncryptedKey: 'wrapped-video',
    documentStorageRef: 'private-document', documentEncryptedKey: 'wrapped-document',
    whitelist: ['private-wallet'],
  };
  const safe = publicPost(original);
  assert.equal(safe.title, 'Paid report');
  for (const field of ['contentKey', 'bodyStorageRef', 'bodyMarkdown', 'media', 'audioStorageRef', 'audioEncryptedKey', 'videoStorageRef', 'videoEncryptedKey', 'documentStorageRef', 'documentEncryptedKey', 'whitelist']) {
    assert.equal(Object.hasOwn(safe, field), false, field);
  }
  assert.equal(original.contentKey, 'wrapped-secret');
});

test('free post preserves readable content and media paths without wrapped keys', () => {
  const safe = publicPost({
    price: '0', bodyMarkdown: 'Readable', contentKey: 'wrapped-secret', bodyStorageRef: 'private-body',
    media: JSON.stringify([{ storageRef: 'private-photo', encryptedKey: 'wrapped-photo', caption: 'Hi' }]),
  });
  assert.equal(safe.bodyMarkdown, 'Readable');
  assert.equal(safe.contentKey, undefined);
  assert.deepEqual(JSON.parse(safe.media), [{ storageRef: 'private-photo', caption: 'Hi' }]);
});
