import { imagePath } from '../assets.js';

const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" class="s-5" aria-label="Check"><path fill="#7C9A6D" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/><path stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 12 2 2 4-4m6 2a9 9 0 1 1-18 0"/></svg>`;

function checkRow(text) {
  return `<div class="flex gap-4">
  <div class="h-7 flex-none flex items-center justify-center">
    ${checkIcon}
  </div>
  <p class="text-lg text-balance">${text}</p>
</div>`;
}

export function featureSection() {
  return `<div class="flex flex-col bg-gray max-w-6xl mx-auto px-4 py-20 gap-8">
  <div class="flex flex-col lg:flex-row gap-8">
    <div class="flex flex-col md:relative bg-white border border-dark-gray/50 rounded-3xl p-8 lg:basis-2/3 h-auto md:h-120">
      <div class="order-1 md:order-0">
        <p class="text-4xl text-balance">
          Sell anything
        </p>
        <p class="text-lg md:absolute md:bottom-8 md:left-8 md:w-1/2 mt-4 md:mt-0">
          Video lessons. Monthly subscriptions. Whatever! Nibgate was created to help you experiment with all kinds of ideas and formats.
        </p>
      </div>
      <div class="w-[484px] order-2 md:order-0 md:absolute md:-top-16 md:-right-2 mt-4 md:mt-0">
        <img alt="Sell anything feature illustration" class="w-full h-auto" src="${imagePath('about/ukulele.png')}" />
      </div>
    </div>
    <div class="flex flex-col md:relative overflow-hidden bg-white border border-dark-gray/50 rounded-3xl p-8 lg:basis-1/3 h-auto md:h-120">
      <div class="order-1 md:order-0">
        <p class="text-4xl mb-4 text-balance">Make your own road</p>
        <p class="text-lg mb-4">
          Whether you need more balance, flexibility, or just a different gig, we make it easy to chart a new path.
        </p>
      </div>
      <div class="order-2 md:order-0 md:absolute md:bottom-0 md:left-0 mt-8 md:mt-0">
        <img alt="Make your own road feature illustration" class="w-full h-auto" src="${imagePath('about/make-your-road.svg')}" />
      </div>
    </div>
  </div>
  <div class="flex flex-col lg:flex-row gap-8">
    <div class="overflow-hidden flex flex-col justify-between bg-white border border-dark-gray/50 rounded-3xl p-8 lg:basis-1/3 h-auto md:h-120">
      <p class="text-4xl mb-8 md:mb-0 text-balance">Sell to anyone</p>
      <div class="flex flex-col gap-4">
        ${checkRow('Go from 0 to $1 and automated workflows.')}
        ${checkRow('Let your customers pay in their own currency.')}
        ${checkRow('Choose between one-time, recurring, or fixed-length payments in your currency of choice.')}
      </div>
    </div>
    <div class="flex flex-col md:relative bg-white border border-dark-gray/50 rounded-3xl p-8 lg:basis-2/3 h-auto md:h-120">
      <div class="order-1 md:order-0">
        <p class="text-4xl text-balance">
          Sell anywhere
        </p>
        <p class="text-lg md:absolute md:bottom-8 md:left-8 md:w-[18rem] mt-4 md:mt-0">
          Create and customize your storefront with our all-in-one platform or choose to use your personal site instead. Seamlessly connect your Nibgate account to thousands of apps in your current stack.
        </p>
      </div>
      <div class="w-[389px] order-2 md:order-0 md:absolute md:top-8 md:-right-8 mt-8 md:mt-0">
        <img alt="Sell to anyone feature illustration" class="w-full h-auto" src="${imagePath('about/sell-anywhere.png')}" />
      </div>
    </div>
  </div>
  <div class="flex flex-col sm:flex-row gap-9">
    <div class="bg-white border border-dark-gray/50 rounded-3xl p-8 md:p-14 flex-1">
      <div class="flex flex-col md:relative">
        <div class="order-2 md:order-0">
          <img alt="Side project 1" class="w-full h-auto" src="${imagePath('about/side-project-1.svg')}" />
        </div>
        <div class="order-1 md:order-0 md:absolute md:-top-4 md:left-0 sm:md:-left-8 bg-white rounded-2xl px-6 sm:px-8 py-4 border border-black mb-4 md:mb-0">
          <p class="text-xl font-medium m-0">Instead of building a company...</p>
        </div>
      </div>
    </div>
    <div class="bg-white border border-dark-gray/50 rounded-3xl p-8 flex-1">
      <div class="flex flex-col md:relative">
        <div class="order-2 md:order-0">
          <img alt="Side project 2" class="w-full h-auto object-cover mx-auto" src="${imagePath('about/side-project-2.svg')}" />
        </div>
        <div class="order-1 md:order-0 md:absolute md:bottom-1 bg-white rounded-2xl px-6 sm:px-6 py-4 border border-black mb-4 md:mb-0">
          <p class="text-xl font-medium m-0">...start selling a side project!</p>
        </div>
      </div>
    </div>
  </div>
</div>`;
}
