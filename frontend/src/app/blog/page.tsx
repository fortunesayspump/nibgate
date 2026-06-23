import Link from "next/link";

const posts = [
  ['You can now unlock creator work with one click', 'June 18, 2026', 'Product'],
  ['Shoppers now see paid routes in their local context', 'June 4, 2026', 'Explore'],
  ['How we use verification to keep the hub trustworthy', 'April 1, 2026', 'Engineering'],
  ["What we shipped, what's next, and our 2026 roadmap", 'March 3, 2026', 'Company'],
  ['New Feature: Creator analytics for better membership insights', 'February 4, 2026', 'Product'],
  ['Automatically apply launch discounts to paid drops', 'January 31, 2026', 'Growth'],
  ['Customizable receipts and post-unlock messages', 'January 13, 2026', 'Product'],
  ['Introducing: Nibgate Tax Center', 'December 22, 2025', 'Company'],
  ['Featuring launch deals on the Nibgate hub', 'November 27, 2025', 'Explore'],
  ['Creator spotlight: how a side project became paid content', 'April 23, 2025', 'Creators'],
  ['Nibgate is open source', 'April 4, 2025', 'Company'],
  ['A trip down Nibgate: the road ahead', 'March 27, 2025', 'Company']
];

import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function BlogPage() {
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <div className="flex-1">
      <section className="bg-gray px-8 py-16 md:py-24 lg:px-[4vw]">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-4xl font-medium leading-none md:text-5xl lg:text-6xl">Blog</h1>
        </div>
      </section>
      <section className="bg-gray px-4 py-8 md:px-8 md:py-12 lg:px-[4vw]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-2">
          {posts.map(([title, date, tag], index) => {
            const featured = index === 0;
            return (
              <Link key={index} href="/blog" className={`group no-underline text-black border border-dark-gray/50 bg-white hover:bg-gray transition-colors ${featured ? 'lg:col-span-2' : ''}`}>
                <article className={`flex h-full flex-col justify-between gap-10 p-6 md:p-8 ${featured ? 'min-h-[28rem]' : 'min-h-72'}`}>
                  <div className="flex items-center justify-between gap-4 text-base">
                    <span>{tag}</span>
                    <span>{date}</span>
                  </div>
                  <h2 className={`${featured ? 'text-5xl md:text-6xl lg:text-7xl' : 'text-3xl md:text-4xl'} font-medium leading-none text-balance`}>{title}</h2>
                  <div className="flex items-center gap-2 text-xl font-medium">
                    <span>Read post</span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      </section>
      </div>
      <Footer showThemeToggle={true} />
    </div>
  );
}
