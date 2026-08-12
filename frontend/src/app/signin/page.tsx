import { Suspense } from "react";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SigninFlow from "@/components/SigninFlow";

export default function SigninPage() {
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <div className="flex-1">
        <section className="bg-gray px-8 py-20 md:py-28 lg:px-[4vw]">
          <div className="mx-auto max-w-md">
            <div className="nibgate-signin-panel bg-black p-6 text-white md:p-8 rounded-2xl">
              <Suspense fallback={<div className="bg-white/10 p-6 rounded-xl text-white/70">Loading wallet sign-in...</div>}>
                <SigninFlow />
              </Suspense>
            </div>
          </div>
        </section>
      </div>
      <Footer showThemeToggle={true} />
    </div>
  );
}
