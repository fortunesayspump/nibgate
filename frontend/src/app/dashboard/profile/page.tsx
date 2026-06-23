export default function ProfilePage() {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-medium">Creator Profile</h2>
        <button className="bg-black text-white px-6 py-2 font-medium rounded cursor-pointer">Save Changes</button>
      </div>
      <div className="border p-8 rounded-2xl shadow-1 space-y-8" style={{ background: 'var(--nib-surface)', borderColor: 'var(--nib-border-soft)' }}>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-gray-200 border-2 overflow-hidden flex items-center justify-center text-gray-500 text-sm">Avatar</div>
          <button className="px-4 py-2 border rounded font-medium hover:opacity-70 cursor-pointer" style={{ borderColor: 'var(--nib-border-soft)' }}>Upload New Avatar</button>
        </div>
        <div className="space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium mb-1">Display Name</label>
            <input type="text" defaultValue="Clinton" className="w-full p-3 border rounded bg-transparent" style={{ borderColor: 'var(--nib-border-soft)', color: 'var(--nib-page-fg)' }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bio</label>
            <textarea rows={3} className="w-full p-3 border rounded bg-transparent" placeholder="Tell your audience about yourself..." style={{ borderColor: 'var(--nib-border-soft)', color: 'var(--nib-page-fg)' }}></textarea>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Connected Wallet</label>
            <input type="text" value="0x8f7b...3c2a" readOnly className="w-full p-3 border rounded bg-transparent opacity-50" style={{ borderColor: 'var(--nib-border-soft)', color: 'var(--nib-page-fg)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
