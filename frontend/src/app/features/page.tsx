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
          <h1 className="text-5xl font-medium md:text-6xl md:leading-[0.9] lg:text-8xl">Built for new beginnings</h1>
          <div className="text-xl md:text-2xl">Nibgate is a powerful, simple toolkit that puts paid content, verification, and discovery tools at your fingertips.</div>
        </div>

        <div className="hidden relative mx-auto h-96 w-full max-w-6xl overflow-hidden bg-gray p-8 rounded-full border lg:block">
          <div className="relative z-10 flex h-full flex-col justify-between border border-dark-gray/50 bg-gray rounded-full px-8">
            <div className="-mt-3 justify-between px-32 flex">
              {['Connect Wallet', 'Connect Site', 'Publish Route'].map((label, i) => (
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
              {['Repeat', 'Get paid'].map((label, i) => (
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
        eyebrow: 'Customizable Options',
        title: 'Your store, your way',
        copy: 'Nibgate plays well with others. Set up your paid routes on our platform, or easily embed them on your existing site.'
      })}

      <SplitBand
        image={undrawAsset('content-creator.svg')}
        imageAlt="Illustration showing customizable store options"
        imageBg="bg-gray"
        titleColor="text-white"
        reverse={true}
        border="border-y"
        textItems={[
          ['Create a home here', 'No site? No problem. Publish gated routes and build a storefront around your work.'],
          ['Use your own website, too', 'Already have a site? Add the package, verify your domain, and keep ownership.'],
          ['Power-up your page', 'Embed unlock flows, paid links, and discovery signals from your existing stack.']
        ]}
      />

      {featureIntro({
        eyebrow: 'Payment Integrations',
        title: 'Money, incoming',
        copy: "Once your wallet and site are connected, paid routes can unlock with normal crypto-native checkout."
      })}

      <SplitBand
        image={undrawAsset('credit-card-payment.svg')}
        imageAlt="Illustration showing payment integrations"
        imageBg="bg-gray"
        titleColor="text-white"
        textItems={[
          ['Create simple memberships', "Give customers access to paid content for as long as they're subscribed."],
          ['Set up subscriptions', 'Let customers pay over time with recurring access.'],
          ["The sky's the limit", 'Give your audience the chance to pay for the work they value.']
        ]}
      />

      <SplitBand
        image={undrawAsset('payments.svg')}
        imageAlt="Illustration showing payment integrations"
        imageBg="bg-gray"
        titleColor="text-white"
        reverse={true}
        textItems={[
          ['Say yes to different currencies', 'Increase opportunities by accepting payments from a broader audience.'],
          ["Don't sweat verification", 'Use one widget script so the hub can verify ownership and receive live content events.']
        ]}
      />

      <SplitBand
        image={undrawAsset('sign-in.svg')}
        imageAlt="Illustration showing license keys"
        imageBg="bg-gray"
        titleColor="text-white"
        border="border-y"
        textItems={[
          ['Generate access', 'Publishing software or private routes? Nibgate can protect what buyers unlock.'],
          ['Offer multiple versions', 'Offer different paid formats, tiers, or route bundles.'],
          ['Protect your work', 'Keep paid content behind a real unlock flow and make access auditable.']
        ]}
      />

      {featureIntro({
        eyebrow: 'Comprehensive Platform',
        title: 'From start to finesse',
        copy: 'A package, app, examples, and discovery layer so you can connect a wallet and publish paid routes quickly.'
      })}

      <SplitBand
        image={undrawAsset('user-flow.svg')}
        imageAlt="Illustration showing various creator tools and features"
        imageBg="bg-gray"
        titleColor="text-white"
        textItems={[
          ['Tools to get going fast', 'Create paid routes quickly or embed the Nibgate package onto an existing site.'],
          ['Publish anything', "We don't limit your ideas. Articles, files, tools, APIs, or memberships can all fit."],
          ['Bring your friends', 'Route your existing audience to a familiar domain and let the hub amplify what is public.']
        ]}
      />

      <SplitBand
        image={undrawAsset('analytics.svg')}
        imageAlt="Interactive graph showing sales analytics and growth metrics"
        imageBg="bg-gray"
        titleColor="text-white"
        reverse={true}
        textItems={[
          ['Be ready when they are', 'Customers can unlock the thing they came for without weird detours.'],
          ['Make decisions with your data', 'See routes, views, unlocks, and public discovery signals in one place.'],
          ['Grow your audience', 'Publish updates, surface paid routes, and connect people back to creator-owned work.']
        ]}
      />

      <div className="flex flex-col items-center justify-center text-center bg-gray gap-8 px-8 py-16 lg:px-[4vw] lg:py-24 lg:gap-16">
        <h2 className="text-4xl font-medium sm:text-5xl lg:text-7xl">
          Share your work. <br /> Someone out there needs it.
        </h2>
        <Link className="nibgate-soft-cta" href="/get-started">Connect your site</Link>
      </div>
      </div>
      <Footer showThemeToggle={true} />
    </div>
  );
}
