import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <div className="explore-page-shell">
        <main className="explore-body explore-main" role="main">
          {children}
        </main>
        <Footer showThemeToggle={true} />
      </div>
    </>
  );
}
