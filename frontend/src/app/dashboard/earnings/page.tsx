export default function EarningsPage() {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-medium">Earnings & Payouts</h2>
        <button className="bg-black text-white px-6 py-2 font-medium rounded cursor-pointer shadow-md transform hover:-translate-y-px transition">Withdraw USDC</button>
      </div>
      <div className="border p-10 rounded-2xl shadow-1 text-center space-y-4" style={{ background: 'var(--nib-surface)', borderColor: 'var(--nib-border-soft)' }}>
        <div className="text-sm font-medium uppercase tracking-widest opacity-60">Available Balance</div>
        <div className="text-6xl md:text-8xl font-bold tracking-tighter">
          2,053.00 <span className="text-3xl opacity-50">USDC</span>
        </div>
        <div className="text-sm opacity-70">Ready to withdraw to your connected wallet instantly on X402 Network.</div>
      </div>
      <h3 className="text-xl font-medium pt-4">Recent Transactions</h3>
      <div className="border rounded-2xl shadow-1 overflow-hidden" style={{ background: 'var(--nib-surface)', borderColor: 'var(--nib-border-soft)' }}>
        <div className="p-4 border-b flex justify-between items-center hover:opacity-70 transition-colors" style={{ borderColor: 'var(--nib-border-soft)' }}>
          <div>
            <div className="font-medium">Unlock: Wedding Presets Vol 1</div>
            <div className="text-sm opacity-60">Today, 2:45 PM</div>
          </div>
          <div className="font-medium text-green-600">+15.00 USDC</div>
        </div>
        <div className="p-4 border-b flex justify-between items-center hover:opacity-70 transition-colors" style={{ borderColor: 'var(--nib-border-soft)' }}>
          <div>
            <div className="font-medium">Unlock: Advanced Photography Setup</div>
            <div className="text-sm opacity-60">Today, 11:20 AM</div>
          </div>
          <div className="font-medium text-green-600">+1.50 USDC</div>
        </div>
        <div className="p-4 flex justify-between items-center hover:opacity-70 transition-colors">
          <div>
            <div className="font-medium">Withdrawal</div>
            <div className="text-sm opacity-60">Yesterday, 9:00 AM</div>
          </div>
          <div className="font-medium text-gray-500">-500.00 USDC</div>
        </div>
      </div>
    </div>
  );
}
