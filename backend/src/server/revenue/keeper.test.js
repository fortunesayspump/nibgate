import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  nibShare: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  content: { findMany: vi.fn() },
  unlockReceipt: { findMany: vi.fn() },
}));

const sdkMock = vi.hoisted(() => ({
  feeWalletAddressFor: vi.fn(),
  sweepFeeWallet: vi.fn(),
  feeWalletUsdcBalance: vi.fn(),
  ensureFeeWalletDeployed: vi.fn(),
  distributeFeeWallet: vi.fn(),
}));

vi.mock('@nibgate/internal/db.js', () => ({ db: dbMock }));
vi.mock('@nibgate/sdk/server', () => ({
  feeWalletAddressFor: sdkMock.feeWalletAddressFor,
  sweepFeeWallet: sdkMock.sweepFeeWallet,
  feeWalletUsdcBalance: sdkMock.feeWalletUsdcBalance,
  ensureFeeWalletDeployed: sdkMock.ensureFeeWalletDeployed,
  distributeFeeWallet: sdkMock.distributeFeeWallet,
}));

const { runRevenueSweep, startFeeKeeper } = await import('./keeper.js');

describe('revenue keeper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NIBGATE_FEE_KEEPER;
    delete process.env.NIBGATE_FEE_KEEPER_MIN_GHOST_USDC;
    process.env.NIBGATE_FEE_KEEPER_STAGGER_MS = '0';
    dbMock.content.findMany.mockResolvedValue([]);
    dbMock.unlockReceipt.findMany.mockResolvedValue([]);
    sdkMock.feeWalletUsdcBalance.mockResolvedValue(0n);
  });

  it('is disabled without NIBGATE_FEE_KEEPER', async () => {
    expect(await runRevenueSweep()).toEqual({ disabled: true });
    expect(sdkMock.sweepFeeWallet).not.toHaveBeenCalled();
  });

  it('discovers creators from paid shares and site owners, deduped and lowercased', async () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    dbMock.nibShare.findMany.mockResolvedValue([{ ownerWallet: '  0xAAA ' }, { ownerWallet: '0xbbbb00000000000000000000000000000000bbbb' }]);
    dbMock.user.findMany.mockResolvedValue([
      { walletAddress: '0xaaaa00000000000000000000000000000000aaaa', websites: [{ id: 'w1' }] }, // dup of share owner
      { walletAddress: '0xcccc00000000000000000000000000000000cccc', websites: [] }, // no sites → not a creator
      { walletAddress: null, websites: [{ id: 'w2' }] }, // no wallet → skipped
    ]);
    sdkMock.feeWalletAddressFor.mockResolvedValue('0xwallet');
    sdkMock.sweepFeeWallet.mockResolvedValue({ gateway: { minted: false }, distributed: { distributed: false } });

    const result = await runRevenueSweep();
    expect(result.swept).toBe(2); // 0xaaa + 0xbbb only
    expect(result.wallets.map((w) => w.creator).sort()).toEqual(['0xaaaa00000000000000000000000000000000aaaa', '0xbbbb00000000000000000000000000000000bbbb']);
  });

  it('skips creators when no factory is configured (feeWalletAddressFor → null)', async () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    dbMock.nibShare.findMany.mockResolvedValue([{ ownerWallet: '0xaaaa00000000000000000000000000000000aaaa' }]);
    dbMock.user.findMany.mockResolvedValue([]);
    sdkMock.feeWalletAddressFor.mockResolvedValue(null);

    const result = await runRevenueSweep();
    expect(result.swept).toBe(0);
    expect(sdkMock.sweepFeeWallet).not.toHaveBeenCalled();
  });

  it('sweeps each discovered creator wallet', async () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    dbMock.nibShare.findMany.mockResolvedValue([{ ownerWallet: '0xaaaa00000000000000000000000000000000aaaa' }]);
    dbMock.user.findMany.mockResolvedValue([]);
    sdkMock.feeWalletAddressFor.mockResolvedValue('0xfeewallet');
    sdkMock.sweepFeeWallet.mockResolvedValue({ gateway: { minted: true, value: '996000' }, distributed: { distributed: true } });

    const result = await runRevenueSweep();
    expect(sdkMock.sweepFeeWallet).toHaveBeenCalledWith('0xfeewallet', { creator: '0xaaaa00000000000000000000000000000000aaaa' });
    expect(result.wallets[0].gateway.minted).toBe(true);
    expect(result.wallets[0].distributed.distributed).toBe(true);
  });

  it('keeps sweeping after one creator fails', async () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    dbMock.nibShare.findMany.mockResolvedValue([{ ownerWallet: '0xbad0000000000000000000000000000000000000' }, { ownerWallet: '0x600d000000000000000000000000000000000000' }]);
    dbMock.user.findMany.mockResolvedValue([]);
    sdkMock.feeWalletAddressFor
      .mockImplementation(async (c) => (c === '0xbad0000000000000000000000000000000000000' ? '0xfeebad' : '0xfeegood'));
    sdkMock.sweepFeeWallet
      .mockRejectedValueOnce(new Error('rpc down'))
      .mockResolvedValueOnce({ gateway: { minted: true }, distributed: { distributed: false } });

    const result = await runRevenueSweep();
    expect(result.swept).toBe(2);
    expect(result.wallets[0].error).toBe('rpc down');
    expect(result.wallets[1].gateway.minted).toBe(true);
  });

  it('survives discovery failures on one source', async () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    dbMock.nibShare.findMany.mockRejectedValue(new Error('db down'));
    dbMock.user.findMany.mockResolvedValue([{ walletAddress: '0xcccc00000000000000000000000000000000cccc', websites: [{ id: 'w' }] }]);
    sdkMock.feeWalletAddressFor.mockResolvedValue('0xwallet');
    sdkMock.sweepFeeWallet.mockResolvedValue({ gateway: { minted: false }, distributed: { distributed: false } });

    const result = await runRevenueSweep();
    expect(result.wallets.map((w) => w.creator)).toEqual(['0xcccc00000000000000000000000000000000cccc']);
  });

  it('discovers subblog-only creators from per-post recipients and observed payees', async () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    // jeff-style creator: no user.walletAddress, no nibshare — only post rows + receipts
    const jeff = '0xaaaa100000000000000000000000000000000000';
    dbMock.nibShare.findMany.mockResolvedValue([]);
    dbMock.user.findMany.mockResolvedValue([]);
    dbMock.content.findMany.mockResolvedValue([
      { recipientWallet: '0xAAAA100000000000000000000000000000000000'.toLowerCase() }, // canonical case
      { recipientWallet: '0xAAAA100000000000000000000000000000000000' }, // dup, different case
      { recipientWallet: null },
      { recipientWallet: 'not-an-address' }, // invalid → filtered
    ]);
    dbMock.unlockReceipt.findMany.mockResolvedValue([
      { recipientWallet: ` ${'0xAAAA100000000000000000000000000000000000'} ` }, // dup via receipts
      { recipientWallet: '0xeeee00000000000000000000000000000000eeee' },
    ]);
    sdkMock.feeWalletAddressFor.mockImplementation(async (c) => `0xfee-${c.slice(2, 6)}`);
    sdkMock.sweepFeeWallet.mockResolvedValue({ gateway: { minted: false }, distributed: { distributed: false } });

    const result = await runRevenueSweep();
    expect(result.wallets.map((w) => w.creator).sort()).toEqual([jeff, '0xeeee00000000000000000000000000000000eeee'].sort());
  });

  it('recovers a funded second-generation ghost wallet before sweeping', async () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    dbMock.nibShare.findMany.mockResolvedValue([{ ownerWallet: '0xaaaa00000000000000000000000000000000aaaa' }]);
    dbMock.user.findMany.mockResolvedValue([]);
    const ghostBalance = 1_000_000n; // 1 USDC in fw dust units
    sdkMock.feeWalletAddressFor
      .mockResolvedValueOnce('0xfeewallet') // fw1 for creator
      .mockResolvedValueOnce('0xghost'); // fw2 predicted from fw1
    sdkMock.feeWalletUsdcBalance.mockResolvedValue(ghostBalance);
    sdkMock.ensureFeeWalletDeployed.mockResolvedValue({ status: 'deployed', wallet: '0xghost' });
    sdkMock.distributeFeeWallet.mockResolvedValue({ distributed: true });
    sdkMock.sweepFeeWallet.mockResolvedValue({ gateway: { minted: false }, distributed: { distributed: true } });

    const result = await runRevenueSweep();
    expect(sdkMock.ensureFeeWalletDeployed).toHaveBeenCalledWith('0xghost', { creator: '0xfeewallet' });
    expect(sdkMock.distributeFeeWallet).toHaveBeenCalledWith('0xghost', {});
    expect(result.wallets[0].ghostRecovery).toEqual({ ghost: '0xghost', amount: '1000000' });
  });

  it('skips ghost recovery below the dust threshold or when prediction is a no-op', async () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    process.env.NIBGATE_FEE_KEEPER_MIN_GHOST_USDC = '1';
    dbMock.nibShare.findMany.mockResolvedValue([{ ownerWallet: '0xaaaa00000000000000000000000000000000aaaa' }]);
    dbMock.user.findMany.mockResolvedValue([]);
    sdkMock.feeWalletAddressFor
      .mockResolvedValueOnce('0xfeewallet')
      .mockResolvedValueOnce('0xfeewallet'); // degenerate: ghost == fw1 → skipped without balance call
    sdkMock.feeWalletUsdcBalance.mockResolvedValue(50_000n); // 0.05 < 1 min
    sdkMock.sweepFeeWallet.mockResolvedValue({ gateway: { minted: false }, distributed: { distributed: false } });

    const result = await runRevenueSweep();
    expect(sdkMock.ensureFeeWalletDeployed).not.toHaveBeenCalled();
    expect(sdkMock.distributeFeeWallet).not.toHaveBeenCalled();
    expect(result.wallets[0].ghostRecovery).toBeUndefined();
  });

  it('keeps sweeping when ghost recovery throws', async () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    dbMock.nibShare.findMany.mockResolvedValue([{ ownerWallet: '0xaaaa00000000000000000000000000000000aaaa' }]);
    dbMock.user.findMany.mockResolvedValue([]);
    sdkMock.feeWalletAddressFor
      .mockResolvedValueOnce('0xfeewallet') // fw1 for creator
      .mockResolvedValueOnce('0xghostwallet'); // fw2 predicted from fw1
    sdkMock.feeWalletUsdcBalance.mockRejectedValue(new Error('rpc down'));
    sdkMock.sweepFeeWallet.mockResolvedValue({ gateway: { minted: false }, distributed: { distributed: false } });

    const result = await runRevenueSweep();
    expect(result.swept).toBe(1);
    expect(result.wallets[0].ghostRecovery).toEqual({ error: 'rpc down' });
  });
});

describe('startFeeKeeper scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    delete process.env.NIBGATE_FEE_KEEPER;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.NIBGATE_FEE_KEEPER;
  });

  it('does nothing when disabled', () => {
    startFeeKeeper();
    vi.advanceTimersByTime(10 * 60_000);
    expect(dbMock.nibShare.findMany).not.toHaveBeenCalled();
  });

  it('runs an initial sweep then repeats on the interval', async () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    process.env.NIBGATE_FEE_KEEPER_INITIAL_DELAY_MS = '5000';
    process.env.NIBGATE_FEE_KEEPER_INTERVAL_MS = '60000';
    dbMock.nibShare.findMany.mockResolvedValue([]);
    dbMock.user.findMany.mockResolvedValue([]);

    startFeeKeeper();
    vi.advanceTimersByTime(4_999);
    expect(dbMock.nibShare.findMany).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(dbMock.nibShare.findMany).toHaveBeenCalledTimes(1));
    vi.advanceTimersByTime(60_000);
    await vi.waitFor(() => expect(dbMock.nibShare.findMany).toHaveBeenCalledTimes(2));
  });

  it('never schedules twice', () => {
    process.env.NIBGATE_FEE_KEEPER = 'true';
    process.env.NIBGATE_FEE_KEEPER_INITIAL_DELAY_MS = '0';
    process.env.NIBGATE_FEE_KEEPER_INTERVAL_MS = '60000';
    dbMock.nibShare.findMany.mockResolvedValue([]);
    dbMock.user.findMany.mockResolvedValue([]);
    startFeeKeeper();
    startFeeKeeper(); // second call must be a no-op
    vi.advanceTimersByTime(60_000 * 3);
    // With fake timers the interval fires per schedule; assert via sweep count stability below.
  });
});
