import { imagePath } from '../assets.js';
import { exploreOrigin } from '../data.js';

function offsetAnchor(label, href) {
  return `<a class="nibgate-soft-cta" href="${href}">${label}</a>`;
}

export function finalCtaSection() {
  return `<div class="bg-gray flex flex-col lg:flex-row rounded-2xl px-4 gap-8 mx-auto max-w-6xl">
  <div class="flex flex-col overflow-hidden lg:flex-col lg:w-1/2 gap-8">
    <div class="flex bg-white items-center px-4 py-10 md:p-10 border lg:border border-dark-gray/50 rounded-2xl">
      <h3 class="font-medium text-4xl md:text-5xl">
        Don't take risks.
        <br />
        That's scary!
      </h3>
    </div>
    <div class="bg-white py-12 md:py-24 p-8 sm:p-32 md:p-32 lg:py-10 lg:px-12 flex items-center justify-center border lg:border rounded-2xl border-dark-gray/50">
      <div class="relative">
        <img alt="Blog post circle illustration" class="w-full h-auto object-cover mx-auto" data-parallax="true" src="${imagePath('about/blog-post-circle-1.svg')}" />
        <div class="absolute -top-4 left-0 sm:-left-8 bg-white rounded-2xl px-6 sm:px-8 py-4 border border-black">
          <p class="text-xl font-medium m-0">Instead of selling a book...</p>
        </div>
      </div>
    </div>
  </div>

  <div class="flex flex-col overflow-hidden lg:flex-col lg:w-1/2 gap-8">
    <div class="bg-white py-12 md:py-24 p-8 sm:p-32 md:p-32 lg:py-10 lg:px-12 flex items-center justify-center border lg:border rounded-2xl border-dark-gray/50">
      <div class="relative">
        <img alt="Blog post circle illustration" class="w-full h-auto object-cover mx-auto" data-parallax="true" src="${imagePath('about/blog-post-circle-2.svg')}" />
        <div class="absolute -bottom-2 left-0 sm:-left-8 bg-white rounded-2xl px-6 sm:px-6 py-4 border border-black">
          <p class="text-xl font-medium m-0">...start by selling a blog post!</p>
        </div>
      </div>
    </div>
    <div class="flex bg-white items-center px-4 py-10 md:p-10 border lg:border border-dark-gray/50 rounded-2xl">
      <h3 class="font-medium text-4xl md:text-5xl">
        Place small bets.
        <br />
        That's exciting!
      </h3>
    </div>
  </div>
</div>

<div class="px-8 py-16 lg:px-[4vw] lg:py-24">
  <div class="flex flex-col lg:flex-col gap-8 lg:gap-16 max-w-5xl mx-auto lg:items-center">
    <h1 class="font-medium text-4xl sm:text-5xl lg:text-7xl text-center"> Share your work. <br> Someone out there needs it.</h1>
    ${offsetAnchor('Start selling', exploreOrigin)}
  </div>
</div>

<img alt="New sale illustration" class="w-full min-h-[300px] object-cover" src="${imagePath('about/new-sale.svg')}" />`;
}
