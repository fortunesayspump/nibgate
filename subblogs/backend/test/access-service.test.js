const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const servicePath = path.join(__dirname, '../src/services/access.service.js');

function loadService({ entitlement = null, priorReceipt = null, failEvent = false } = {}) {
  const events = [];
  const receipts = [];
  const prisma = {
    blogPostReceipt: {
      findUnique: async () => priorReceipt,
      create: async ({ data }) => {
        const receipt = { id: `receipt-${receipts.length + 1}`, ...data };
        receipts.push(receipt);
        return receipt;
      },
    },
    blogPostEntitlement: {
      findUnique: async () => entitlement,
      upsert: async ({ create, update }) => entitlement ? { ...entitlement, ...update } : create,
    },
    blogPostEvent: {
      create: async ({ data }) => {
        if (failEvent) throw new Error('event write failed');
        events.push(data);
        return data;
      },
    },
  };
  prisma.$transaction = async (work) => {
    const receiptLength = receipts.length;
    const eventLength = events.length;
    try {
      return await work(prisma);
    } catch (error) {
      receipts.length = receiptLength;
      events.length = eventLength;
      throw error;
    }
  };
  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  const sdk = {
    normalizeWhitelist: (value) => value,
    isWhitelisted: () => false,
    inWhitelist: () => false,
    effectivePrice: (post) => post.price,
    isPaidValue: (price) => Number(price) > 0,
    paidCutoffWallets: () => [],
    accessDecision: () => ({ ok: true }),
    canAccess: () => ({ allowed: true }),
  };
  const dependencies = {
    'http-status': { status: { FORBIDDEN: 403 } },
    '../utils/ApiError': ApiError,
    '../lib/prisma': prisma,
    '@nibgate/sdk/server': sdk,
  };
  const context = {
    require: (name) => dependencies[name] ?? require(name),
    module: { exports: {} },
    Buffer,
    Date,
    Math,
  };
  vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), context, { filename: servicePath });
  return { service: context.module.exports, events, receipts };
}

test('a distinct payment records an unlock event even for an existing entitlement', async () => {
  const existingEntitlement = {
    siteId: 'site-1', postId: 'post-1', wallet: '0x1111111111111111111111111111111111111111',
    status: 'active', source: 'paid',
  };
  const { service, events, receipts } = loadService({ entitlement: existingEntitlement });

  const receipt = await service.grantUnlock({
    post: { id: 'post-1', siteId: 'site-1', price: '1' },
    payer: existingEntitlement.wallet,
    txHash: '0xnew-payment',
    amount: '1',
  });

  assert.equal(receipt.id, 'receipt-1');
  assert.equal(receipts.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [{
    siteId: 'site-1', postId: 'post-1', type: 'unlock', wallet: existingEntitlement.wallet,
  }]);
});

test('a replayed payment does not create another receipt or unlock event', async () => {
  const priorReceipt = { id: 'receipt-existing', paymentNonce: '0xreplayed', postId: 'post-1' };
  const { service, events, receipts } = loadService({ priorReceipt });

  const result = await service.grantUnlock({
    post: { id: 'post-1', siteId: 'site-1', price: '1' },
    payer: '0x1111111111111111111111111111111111111111',
    txHash: '0xreplayed',
    amount: '1',
  });

  assert.equal(result.replay, true);
  assert.equal(result.receipt, priorReceipt);
  assert.equal(receipts.length, 0);
  assert.equal(events.length, 0);
});

test('a banned entitlement cannot be revived by the grant service', async () => {
  const banned = {
    siteId: 'site-1', postId: 'post-1', wallet: '0x1111111111111111111111111111111111111111',
    status: 'banned', source: 'paid',
  };
  const { service, events, receipts } = loadService({ entitlement: banned });

  await assert.rejects(service.grantUnlock({
    post: { id: 'post-1', siteId: 'site-1', price: '1' },
    payer: banned.wallet,
    txHash: '0xbanned-payment',
    amount: '1',
  }), /banned from this post/);

  assert.equal(receipts.length, 0);
  assert.equal(events.length, 0);
});

test('an event-write failure rolls back the receipt instead of creating a lossy replay', async () => {
  const { service, events, receipts } = loadService({ failEvent: true });

  await assert.rejects(service.grantUnlock({
    post: { id: 'post-1', siteId: 'site-1', price: '1' },
    payer: '0x1111111111111111111111111111111111111111',
    txHash: '0xevent-failure',
    amount: '1',
  }), /event write failed/);

  assert.equal(receipts.length, 0);
  assert.equal(events.length, 0);
});
