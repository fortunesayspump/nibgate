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
      <div className="overflow-hidden">
        <div className="explore-body explore-main min-h-screen flex flex-col" role="main">
          {children}
        </div>
        <Footer showThemeToggle={true} />
      </div>
    </>
  );
}
