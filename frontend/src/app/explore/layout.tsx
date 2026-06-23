import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ExploreControls from "./_components/ExploreControls";

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <div className="overflow-hidden">
        <div className="explore-body explore-main min-h-screen flex flex-col" role="main">
          <ExploreControls />
          {children}
        </div>
        <Footer showThemeToggle={true} />
      </div>
    </>
  );
}
