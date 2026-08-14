// Batch 21 — Invite-only access semantics (not covered by the batch10 matrix,
// which tests wlfree/wldrop only and invite for anon):
//   - invite-only + whitelisted buyer + NO tier  -> allowed to attempt, must pay
//     public price (no invite-lockout banner, paywall at public price)
//   - invite-only + whitelisted buyer + Free tier-> unlocks for free
//   - invite-only + non-whitelisted buyer        -> invite-only lockout banner
// Note: media-type × tier combos are already covered by gateWhitelistedMatrix
// (batch10). Media shares can't be created via the form without real uploads,
// so this batch stays on article.
const { connectSellerFlow, fillNewShare, install, SEL_PK, BUY_PK } = require('../harness/prod-lib.js');

const B = 'https://nibgate.xyz';
const BUY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

async function createShare(h, ctx, { title, type = 'article', body, access, price, whitelist, wlTier, inviteOnly }) {
  const { page } = ctx;
  for (let attempt = 0; attempt < 2; attempt++) {
    await h.gotoSafe(page, `${B}/share`);
    await connectSellerFlow(page, { label: 'cr21', log: () => {} }).catch(() => {});
    await page.waitForTimeout(1800);
    await page.locator('input[placeholder^="Post title"], input[placeholder*="title"]').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    const r = await fillNewShare(page, { title, type, body, access, price, whitelist, wlTier, inviteOnly, log: () => {} });
    if (r.slug) { ctx.log(`SHARE URL: ${B}/ns/${r.slug}  (${title})`); return r; }
    ctx.log(`create retry ${attempt + 1}: ${title}`);
  }
  return { published: false, slug: '' };
}

async function buyerGate(h, ctx, slug) {
  const page2 = await ctx.context.newPage();
  await install({ page: page2, pk: BUY_PK });
  await h.gotoSafe(page2, `${B}/ns/${slug}`);
  await connectSellerFlow(page2, { label: 'buy21', log: () => {} }).catch(() => {});
  await page2.waitForTimeout(2500);
  const body = await h.bodyText(page2);
  await page2.close().catch(() => {});
  return body;
}

const checks = [
  {
    id: 'invite-wl-buyer-no-tier-pays', group: 'types-wl-invite',
    name: 'invite-only + whitelisted buyer + no tier: allowed but pays public price',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { title, slug, published } = await createShare(h, ctx, {
        title: `E2E invite no-tier ${Date.now().toString(36)}`,
        type: 'article', body: 'invite no-tier body', access: 'paid', price: 5,
        whitelist: [BUY], inviteOnly: true,
      });
      if (!published) return [[false, `share not published (${slug})`]];
      const body = await buyerGate(h, ctx, slug);
      const expects = [];
      expects.push([/0x3C44/i.test(body), `buyer connected (${/0x3C44/i.test(body)})`]);
      expects.push([!/Invite only/i.test(body), `no invite-lockout banner (${/Invite only/i.test(body)})`]);
      expects.push([/5 USDC/i.test(body), `public price 5 USDC shown (${/5 USDC/i.test(body)})`]);
      expects.push([/Pay to unlock/i.test(body), `paywall present (${/Pay to unlock/i.test(body)})`]);
      expects.push([!/E2E invite no-tier body/.test(body), 'no content leak']);
      return expects;
    }
  },
  {
    id: 'invite-wl-buyer-free-tier-unlocks', group: 'types-wl-invite',
    name: 'invite-only + whitelisted buyer + Free tier: unlocks for free',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { title, slug, published } = await createShare(h, ctx, {
        title: `E2E invite free-tier ${Date.now().toString(36)}`,
        type: 'article', body: 'invite free-tier body', access: 'paid', price: 5,
        whitelist: [BUY], wlTier: 'free', inviteOnly: true,
      });
      if (!published) return [[false, `share not published (${slug})`]];
      const page2 = await ctx.context.newPage();
      await install({ page: page2, pk: BUY_PK });
      await h.gotoSafe(page2, `${B}/ns/${slug}`);
      await connectSellerFlow(page2, { label: 'buy21', log: () => {} }).catch(() => {});
      await page2.waitForTimeout(2500);
      const pre = await h.bodyText(page2);
      const expects = [];
      expects.push([/0x3C44/i.test(pre), `buyer connected (${/0x3C44/i.test(pre)})`]);
      expects.push([/free/i.test(pre) || /0 USDC/i.test(pre), `free tier shown (${/free/i.test(pre) || /0 USDC/i.test(pre)})`]);
      // Tap "Unlock for free" to mint the free entitlement, then content renders.
      // Use pointerdown dispatch: a stuck w3m-modal in the harness can intercept
      // normal clicks, but the widget listens on pointerdown.
      const unlockBtn = page2.getByRole('button', { name: /Unlock for free/i }).first();
      expects.push([await unlockBtn.count() > 0, `Unlock for free button present (${await unlockBtn.count()})`]);
      if (await unlockBtn.count()) {
        await unlockBtn.dispatchEvent('pointerdown').catch(() => {});
        await page2.waitForTimeout(8000);
      }
const post = await h.bodyText(page2);
      expects.push([/invite free-tier body/.test(post), `content unlocked after free mint (${/invite free-tier body/.test(post)})`]);
      await page2.close().catch(() => {});
      return expects;
    }
  },
  {
    id: 'invite-nonwl-buyer-lockout', group: 'types-wl-invite',
    name: 'invite-only + non-whitelisted buyer: invite-only lockout',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { title, slug, published } = await createShare(h, ctx, {
        title: `E2E invite nonwl ${Date.now().toString(36)}`,
        type: 'article', body: 'invite nonwl body', access: 'paid', price: 5,
        whitelist: [BUY], inviteOnly: true,
      });
      if (!published) return [[false, `share not published (${slug})`]];
      // Non-whitelisted buyer = a wallet NOT in the whitelist. BUY_PK is whitelisted;
      // generate a throwaway wallet with a random private key.
      const { generatePrivateKey } = require('viem/accounts');
      const freshPk = generatePrivateKey();
      const page2 = await ctx.context.newPage();
      await install({ page: page2, pk: freshPk });
      await h.gotoSafe(page2, `${B}/ns/${slug}`);
      await connectSellerFlow(page2, { label: 'anon21', log: () => {} }).catch(() => {});
      await page2.waitForTimeout(2500);
      const body = await h.bodyText(page2);
      await page2.close().catch(() => {});
      const expects = [];
      expects.push([/Invite only/i.test(body), `invite-only lockout banner (${/Invite only/i.test(body)})`]);
      expects.push([!/E2E invite nonwl body/.test(body), 'no content leak']);
      return expects;
    }
  },
];

module.exports = { name: 'batch21-wl-invite-tiers', checks };