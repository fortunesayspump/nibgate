import DashboardSidebar from "@/components/DashboardSidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .nibgate-site-footer, .app__footer { display: none !important; }
        body { overflow: hidden; }
      `}} />
      <div className="flex flex-1 flex-col lg:flex-row h-[calc(100vh-80px)] border-t" style={{ background: 'var(--nib-page-bg)', color: 'var(--nib-page-fg)', borderColor: 'var(--nib-border-soft)' }}>
        <DashboardSidebar />
        <main className="flex flex-col overflow-y-auto dashboard-main-content w-full" style={{ background: 'var(--nib-page-bg)' }}>
          {children}
        </main>
      </div>
    </>
  );
}
