export default function ContentsPage() {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-medium">Your Contents</h2>
        <button className="bg-black text-white px-6 py-2 font-medium rounded cursor-pointer">Sync Manifest</button>
      </div>
      
      {/* 
        Bug Fix: Removed 'border' on the wrapper to prevent double borders with the table rows.
        Bug Fix: Added color: var(--nib-page-fg) to the thead to ensure visibility in dark mode.
      */}
      <div className="rounded-2xl shadow-1 overflow-hidden" style={{ background: 'var(--nib-surface)', border: '1px solid var(--nib-border-soft)' }}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b text-sm opacity-80" style={{ borderColor: 'var(--nib-border-soft)', color: 'var(--nib-page-fg)' }}>
              <th className="p-4 font-medium">Item</th>
              <th className="p-4 font-medium">Type</th>
              <th className="p-4 font-medium">Price</th>
              <th className="p-4 font-medium text-right">Unlocks</th>
            </tr>
          </thead>
          <tbody className="text-base divide-y" style={{ borderColor: 'var(--nib-border-soft)' }}>
            <tr className="hover:opacity-70 transition-colors">
              <td className="p-4 font-medium">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded"></div>
                  Advanced Photography Setup
                </div>
              </td>
              <td className="p-4">Article</td>
              <td className="p-4">1.50 USDC</td>
              <td className="p-4 text-right">42</td>
            </tr>
            <tr className="hover:opacity-70 transition-colors">
              <td className="p-4 font-medium">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded"></div>
                  Wedding Presets Vol 1
                </div>
              </td>
              <td className="p-4">Download</td>
              <td className="p-4">15.00 USDC</td>
              <td className="p-4 text-right">128</td>
            </tr>
            <tr className="hover:opacity-70 transition-colors">
              <td className="p-4 font-medium">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded"></div>
                  Behind the Scenes Video
                </div>
              </td>
              <td className="p-4">Video</td>
              <td className="p-4">5.00 USDC</td>
              <td className="p-4 text-right">16</td>
            </tr>
          </tbody>
        </table>
        <div className="p-4 text-center text-sm opacity-60 border-t" style={{ borderColor: 'var(--nib-border-soft)' }}>
          These items are automatically synced from your verified websites.
        </div>
      </div>
    </div>
  );
}
