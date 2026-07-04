import Link from "next/link";

const featureAsset = (name: string) => `/illustrations/features/${name}`;
const undrawAsset = (name: string) => `/illustrations/undraw/${name}`;

function featureIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="px-8 pb-24 pt-20 md:px-12 md:pb-32 md:pt-24">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col items-start gap-7 text-left md:items-center md:text-center">
          <div className="text-lg font-medium lg:text-xl">{eyebrow}</div>
          <h2 className="text-5xl font-medium md:text-6xl lg:text-7xl xl:text-8xl">{title}</h2>
          <div className="max-w-3xl text-lg md:text-2xl lg:leading-10 xl:text-3xl">{copy}</div>
        </div>
      </div>
    </div>
  );
}

function SplitBand({
  image,
  imageAlt,
  imageBg,
  textItems,
  titleColor,
  reverse = false,
  border = 'border-t',
  extras = null
}: {
  image: string;
  imageAlt: string;
  imageBg: string;
  textItems: Array<[string, string]>;
  titleColor: string;
  reverse?: boolean;
  border?: string;
  extras?: React.ReactNode;
}) {
  const imageOrder = reverse ? 'lg:order-2' : '';
  return (
    <div className={`flex flex-col overflow-hidden lg:flex-row ${border}`}>
      <div className={`flex items-center justify-center ${imageBg} p-8 py-16 sm:p-12 md:p-16 lg:w-1/2 ${imageOrder} xl:p-32`}>
        <div className="relative max-w-xl">
          <img className="h-auto w-full" data-parallax="true" alt={imageAlt} src={image.startsWith('/illustrations') ? image : featureAsset(image)} />
          {extras}
        </div>
      </div>
      <div className="flex items-center justify-center bg-black p-8 py-16 text-white sm:p-12 md:p-16 lg:w-1/2 xl:p-32">
        <div className="max-w-2xl space-y-12 md:space-y-16">
          {textItems.map(([title, copy]: [string, string], index: number) => (
            <div key={index} className="space-y-4">
              <h3 className={`text-3xl font-medium ${titleColor} lg:text-4xl xl:text-5xl`}>{title}</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function FeaturesPage() {
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <div className="flex-1">
      <header className="relative flex flex-col items-center justify-center h-auto bg-gray text-center gap-20 px-8 pt-16 pb-20 md:pt-20 md:pb-24 lg:pt-28 lg:pb-36">
        <div className="flex flex-col max-w-2xl gap-8 lg:gap-10 lg:max-w-3xl">
          <div className="text-xl md:text-2xl">Product features</div>
          <h1 className="nibgate-display-title text-5xl font-medium md:text-6xl lg:text-8xl">The package and hub for paid content</h1>
          <div className="text-xl md:text-2xl">Install the package on your own site, protect paid routes, stream content events, and make verified creator work discoverable to humans and AI agents.</div>
        </div>

        <div className="hidden relative mx-auto h-96 w-full max-w-6xl overflow-hidden bg-gray p-8 rounded-full border lg:block">
          <div className="relative z-10 flex h-full flex-col justify-between border border-dark-gray/50 bg-gray rounded-full px-8">
            <div className="-mt-3 justify-between px-32 flex">
              {['Install package', 'Verify site', 'Protect route'].map((label, i) => (
                <div key={i} className="flex h-6 items-center bg-gray pr-6 gap-x-3">
                  <img className="h-6 w-6 -translate-x-3 -translate-y-px" src={featureAsset('arrowhead-right.svg')} alt="" />
                  <div className="text-xl xl:text-2xl">{label}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-around space-x-4 items-center">
              <img className="h-32 w-auto" src={undrawAsset('content-creator.svg')} alt="Creator" />
              <img className="h-32 w-auto" src={undrawAsset('posts.svg')} alt="Publish" />
              <img className="h-32 w-auto" src={undrawAsset('checklist.svg')} alt="Manage" />
              <img className="h-32 w-auto" src={undrawAsset('analytics.svg')} alt="Analytics" />
            </div>
            <div className="-mb-3 justify-between px-32 flex">
              {['Stream events', 'Rank content'].map((label, i) => (
                <div key={i} className="flex h-6 items-center bg-gray pl-6 gap-x-3">
                  <div className="text-xl xl:text-2xl">{label}</div>
                  <img className="h-6 w-6 translate-x-3 translate-y-px rotate-180" alt="" src={featureAsset('arrowhead-right.svg')} />
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="pointer-events-none absolute inset-0 overflow-visible z-10">
          <img className="absolute -left-16 top-0 h-32 w-32 lg:left-24 lg:top-32 lg:h-56 lg:w-56" alt="Feature receipt illustration" src={undrawAsset('artificial-intelligence.svg')} />
          <img className="absolute -right-24 bottom-0 h-32 w-32 lg:right-64 lg:-bottom-24 lg:h-48 lg:w-48" alt="Feature receipt illustration" src={undrawAsset('server.svg')} />
        </div>
      </header>

      {featureIntro({
        eyebrow: 'Package features',
        title: 'Gate content from your own site',
        copy: 'Nibgate starts with a simple npm package. Your content stays on your domain while the package handles content registration, route protection, one-time unlock events, and payment receipt metadata.'
      })}

      <SplitBand
        image={undrawAsset('content-creator.svg')}
        imageAlt="Illustration showing package-powered content gating"
        imageBg="bg-gray"
        titleColor="text-white"
        reverse={true}
        border="border-y"
        textItems={[
          ['One install', 'Use `npm install @nibgate/sdk`, import `gate(...)`, and describe the article, music, image, video, file, or route you want Nibgate to track.'],
          ['Real route protection', 'Use `@nibgate/sdk/server` to return payment challenges, verify receipts, and issue one-time unlock tokens only after payment succeeds.'],
          ['Extensible unlock policy', 'Launch with pay-once unlocks now, then add metered streaming, metered reading, passes, or agent quotas later without changing the core package shape.']
        ]}
      />

      {featureIntro({
        eyebrow: 'Payments and unlocks',
        title: 'Paid access without custody',
        copy: "Nibgate records payment and unlock metadata, but funds route from buyer to the creator's configured receiving address. The hub is analytics and discovery, not a withdrawal wallet."
      })}

      <SplitBand
        image={undrawAsset('credit-card-payment.svg')}
        imageAlt="Illustration showing payment integrations"
        imageBg="bg-gray"
        titleColor="text-white"
        textItems={[
          ['Circle Gateway and x402 rails', 'Use Gateway/x402-style payment challenges for paid routes, with Arc testnet and Circle Gateway receipt metadata supported by the package and hub.'],
          ['One-time unlock tokens after verification', 'The server issues Nibgate unlock tokens only after the creator payment layer reports a verified payment receipt.'],
          ['Multiple sites, multiple receivers', 'A creator can verify multiple sites, and each site can route payments to its own configured receiving address.']
        ]}
      />

      <SplitBand
        image={undrawAsset('payments.svg')}
        imageAlt="Illustration showing payment integrations"
        imageBg="bg-gray"
        titleColor="text-white"
        reverse={true}
        textItems={[
          ['Payment receipts that mean something', 'Store Circle payment ids and receipt URLs when available, or Arc transaction hashes and explorer links for testnet flows.'],
          ['Fail-closed unlocks', 'Production routes should stay locked until the site verifies a real payment receipt. Future metered modes should follow the same rule.']
        ]}
      />

      <SplitBand
        image={undrawAsset('sign-in.svg')}
        imageAlt="Illustration showing content events and unlock tokens"
        imageBg="bg-gray"
        titleColor="text-white"
        border="border-y"
        textItems={[
          ['Register content metadata', 'The package sends public metadata for articles, music, images, and videos so the hub can index what exists without hosting the private payload.'],
          ['Track unlock activity', 'Emit views, unlock starts, completed unlocks, payment receipts, and custom events through the widget bridge.'],
          ['Keep private content private', 'Nibgate Hub discovers and ranks content metadata; the actual paid content remains on the creator site.']
        ]}
      />

      {featureIntro({
        eyebrow: 'Hub features',
        title: 'A verified discovery layer',
        copy: 'The hub connects creator wallets, verified domains, package events, analytics, earnings records, and reputation into one place for people and agents to discover quality content.'
      })}

      <SplitBand
        image={undrawAsset('user-flow.svg')}
        imageAlt="Illustration showing various creator tools and features"
        imageBg="bg-gray"
        titleColor="text-white"
        textItems={[
          ['Verified sites', 'Add a domain in the dashboard, paste the widget script, and let Nibgate verify ownership before content becomes trusted in the hub.'],
          ['Content discovery', 'Explore surfaces verified articles, music, images, and videos with source context, pricing, tags, and reputation signals.'],
          ['Agent-readable context', 'The hub and site metadata give AI agents a cleaner way to discover paid content, understand price, and route users back to the origin site.']
        ]}
      />

      <SplitBand
        image={undrawAsset('analytics.svg')}
        imageAlt="Interactive graph showing sales analytics and growth metrics"
        imageBg="bg-gray"
        titleColor="text-white"
        reverse={true}
        textItems={[
          ['Analytics by site and content', 'See views, content events, unlock starts, completed unlocks, traffic sources, timelines, and historical trends.'],
          ['Earnings records', 'Track paid unlock revenue, receiving addresses, payment ids, transaction hashes, and receipt links without implying Nibgate custodies funds.'],
          ['Reputation and leaderboards', 'Content earns ratings and engagement signals, which roll up into site and creator reputation for ranking and discovery.']
        ]}
      />

      <div className="flex flex-col items-center justify-center text-center bg-gray gap-8 px-8 py-16 lg:px-[4vw] lg:py-24 lg:gap-16">
        <h2 className="text-4xl font-medium sm:text-5xl lg:text-7xl">
          Own the route. <br /> Let the hub discover it.
        </h2>
        <Link className="nibgate-soft-cta" href="/get-started">Start with the package</Link>
      </div>
      </div>
      <Footer showThemeToggle={true} />
    </div>
  );
}
