import { imagePath } from '../assets.js';
import { exploreOrigin } from '../data.js';

function textGroup(items, color = 'text-orange') {
  return `<div class="max-w-2xl space-y-12 md:space-y-16">
    ${items
      .map(
        ([title, copy]) => `<div class="space-y-4">
          <h3 class="text-3xl font-medium ${color} lg:text-4xl xl:text-5xl">${title}</h3>
          <p class="text-lg lg:text-xl xl:text-2xl">${copy}</p>
        </div>`
      )
      .join('')}
  </div>`;
}

function splitBand({ image, alt, imageBg, color, reverse = false, items }) {
  const imageOrder = reverse ? 'lg:order-2' : '';

  return `<div class="flex flex-col overflow-hidden lg:flex-row">
    <div class="flex items-center justify-center ${imageBg} p-8 py-16 sm:p-12 md:p-16 lg:w-1/2 ${imageOrder} xl:p-32">
      <div class="relative max-w-xl">
        <img class="h-auto w-full" alt="${alt}" src="${imagePath(image)}" />
      </div>
    </div>
    <div class="flex items-center justify-center bg-black p-8 py-16 text-white sm:p-12 md:p-16 lg:w-1/2 xl:p-32">
      ${textGroup(items, color)}
    </div>
  </div>`;
}

export function featureSection() {
  return `<section class="bg-gray">
    <div class="px-8 pb-24 pt-20 md:px-12 md:pb-32 md:pt-24">
      <div class="mx-auto max-w-5xl">
        <div class="flex flex-col items-start gap-7 text-left md:items-center md:text-center">
          <div class="text-lg font-medium lg:text-xl">Creator-owned payments</div>
          <h2 class="text-4xl font-medium md:text-5xl lg:text-6xl">Sell protected work from the site you already own</h2>
          <div class="max-w-3xl text-lg md:text-2xl lg:leading-10 xl:text-3xl">Nibgate gives paid writing, media, files, and agent routes a clean unlock flow without turning your website into someone else's marketplace.</div>
        </div>
      </div>
    </div>

    ${splitBand({
      image: 'about/ukulele.png',
      alt: 'Paid content illustration',
      imageBg: 'bg-gray',
      color: 'text-white',
      reverse: true,
      items: [
        ['Protect the route', 'Pick the article, download, video, song, image, or API route that should unlock after payment.'],
        ['Keep the source of truth', 'Your content stays on your domain. Nibgate handles the gateway around it.'],
        ['Let the page stay yours', 'Use your existing layout, brand, analytics, and publishing workflow.']
      ]
    })}

    <div class="relative overflow-hidden bg-white">
      <div class="mx-auto grid max-w-6xl gap-12 px-8 py-16 md:px-12 lg:grid-cols-2 lg:items-center lg:py-24">
        <div class="flex items-center justify-center">
          <img class="h-auto w-full max-w-md" alt="Route manifest illustration" src="${imagePath('about/make-your-road.svg')}" />
        </div>
        <div class="max-w-xl space-y-8">
          <h2 class="text-4xl font-medium sm:text-5xl lg:text-7xl">Publish once. Show up in discovery.</h2>
          <p class="text-xl md:text-2xl">A public manifest tells Nibgate what can be previewed, priced, categorized, and measured while the paid payload stays private.</p>
          <a class="nibgate-soft-cta" href="${exploreOrigin}">Open explore</a>
        </div>
      </div>
    </div>

    ${splitBand({
      image: 'about/sell-anywhere.png',
      alt: 'Payments illustration',
      imageBg: 'bg-gray',
      color: 'text-white',
      items: [
        ['Take Arc payments', 'Use x402-friendly payment gates on Arc testnet for people, agents, and paid routes.'],
        ['Ship with the package', 'Install the library, map your protected paths, and test the Arc unlock flow locally.'],
        ['Grow into the app', 'Creators can later view routes, performance, and discovery signals in the Nibgate app.']
      ]
    })}

    <div class="flex flex-col items-center justify-center gap-8 bg-white px-8 py-16 text-center lg:px-[4vw] lg:py-24 lg:gap-16">
      <h2 class="text-4xl font-medium sm:text-5xl lg:text-6xl">Start with one paid route.<br>Grow from there.</h2>
      <p class="max-w-2xl text-xl md:text-2xl">Run the first demo on Arc testnet, then bring the same route manifest into discovery.</p>
      <div class="flex flex-col gap-4 sm:flex-row">
        <a class="nibgate-soft-cta" href="/get-started">Get started</a>
        <a class="nibgate-soft-cta" href="/features">See features</a>
      </div>
    </div>
  </section>`;
}
