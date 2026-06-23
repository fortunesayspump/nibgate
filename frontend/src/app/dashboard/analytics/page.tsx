export default function AnalyticsPage() {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <h2 className="text-3xl font-medium">Deep Analytics</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border p-6 rounded-2xl shadow-1" style={{ background: 'var(--nib-surface)', borderColor: 'var(--nib-border-soft)' }}>
          <div className="text-sm opacity-70 mb-2 font-medium">Total Views</div>
          <div className="text-4xl font-bold">12,405</div>
          <div className="text-green-500 text-sm mt-2 font-medium">↑ 14% this week</div>
        </div>
        <div className="border p-6 rounded-2xl shadow-1" style={{ background: 'var(--nib-surface)', borderColor: 'var(--nib-border-soft)' }}>
          <div className="text-sm opacity-70 mb-2 font-medium">Unlock Rate</div>
          <div className="text-4xl font-bold">4.2%</div>
          <div className="text-green-500 text-sm mt-2 font-medium">↑ 1.1% this week</div>
        </div>
        <div className="border p-6 rounded-2xl shadow-1" style={{ background: 'var(--nib-surface)', borderColor: 'var(--nib-border-soft)' }}>
          <div className="text-sm opacity-70 mb-2 font-medium">Top Traffic Source</div>
          <div className="text-2xl font-bold mt-2">Explore Page</div>
          <div className="text-gray-500 text-sm mt-2 font-medium">68% of volume</div>
        </div>
      </div>
      <div className="border p-8 rounded-2xl shadow-1 h-64 flex items-center justify-center text-gray-400" style={{ background: 'var(--nib-surface)', borderColor: 'var(--nib-border-soft)' }}>
        [ Interactive Chart Area Placeholder ]
      </div>
    </div>
  );
}
