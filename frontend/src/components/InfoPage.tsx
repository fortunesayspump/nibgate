import Link from "next/link";

import Header from "@/components/Header";
import Footer from "@/components/Footer";

type InfoPageProps = {
  eyebrow: string;
  title: string;
  copy: string;
  primaryCta?: [string, string];
  secondaryCta?: [string, string];
  cards?: Array<[string, string]>;
  sections?: Array<[string, string]>;
};

function CtaLink({ cta, secondary = false }: { cta: [string, string]; secondary?: boolean }) {
  const [label, href] = cta;
  const className = secondary ? "nibgate-soft-cta nibgate-soft-cta-secondary" : "nibgate-soft-cta";
  const isExternal = href.startsWith("http") || href.startsWith("mailto:");

  if (isExternal) {
    return (
      <a className={className} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined}>
        {label}
      </a>
    );
  }

  return <Link className={className} href={href}>{label}</Link>;
}

export default function InfoPage({ eyebrow, title, copy, primaryCta, secondaryCta, cards = [], sections = [] }: InfoPageProps) {
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="bg-gray px-8 py-20 md:py-28 lg:px-[4vw]">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-4xl space-y-8">
              <p className="text-xl font-medium">{eyebrow}</p>
              <h1 className="nibgate-display-title text-5xl font-medium md:text-7xl lg:text-8xl">{title}</h1>
              <p className="max-w-3xl text-xl leading-8 md:text-2xl md:leading-9">{copy}</p>
              {(primaryCta || secondaryCta) && (
                <div className="flex flex-wrap gap-4">
                  {primaryCta && <CtaLink cta={primaryCta} />}
                  {secondaryCta && <CtaLink cta={secondaryCta} secondary />}
                </div>
              )}
            </div>
          </div>
        </section>

        {cards.length > 0 && (
          <section className="bg-gray px-4 pb-12 md:px-8 lg:px-[4vw]">
            <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cards.map(([cardTitle, cardCopy]) => (
                <article key={cardTitle} className="border border-dark-gray/50 bg-white p-6 md:p-8">
                  <h2 className="text-3xl font-medium leading-none md:text-4xl">{cardTitle}</h2>
                  <p className="mt-5 text-lg leading-8">{cardCopy}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {sections.length > 0 && (
          <section className="bg-black px-8 py-16 text-white md:py-24 lg:px-[4vw]">
            <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2">
              {sections.map(([sectionTitle, sectionCopy]) => (
                <article key={sectionTitle} className="border-t border-white/25 pt-6">
                  <h2 className="text-3xl font-medium md:text-5xl">{sectionTitle}</h2>
                  <p className="mt-5 text-lg leading-8 opacity-80 md:text-xl">{sectionCopy}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer showThemeToggle={true} />
    </div>
  );
}
