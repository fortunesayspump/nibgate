import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header activePath="/" />
      <div className="overflow-hidden">
        <div className="bg-gray min-h-screen flex flex-col">
          <div className="flex-1">
            <Hero />
            <Features />
          </div>
          <Footer showThemeToggle={true} />
        </div>
      </div>
    </>
  );
}
