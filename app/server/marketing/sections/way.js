import { imagePath } from '../assets.js';
import { arrowIconDataUri } from '../../shared/placeholders.js';
import { exploreOrigin } from '../data.js';

export function waySection() {
  return `<div class="relative bg-gray py-24 lg:py-32">
  <div class="px-8 lg:px-[4vw]">
    <div class="max-w-4xl mx-auto text-center text-4xl mb-20 lg:mb-24 lg:leading-tight lg:text-5xl">
      You know all those great ideas you have?
    </div>
  </div>
  <div class="relative max-w-6xl mx-auto mb-12 h-80 bg-orange p-8 lg:border lg:rounded-full">
    <div id="lottie-animation" class="absolute w-56 h-56 z-20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 lg:top-20 lg:w-80 lg:h-80">
      <img alt="Nibgate placeholder illustration" class="w-full h-full object-contain" src="${imagePath('about/nibhead.svg')}" />
    </div>
    <div class="relative flex h-full flex-col justify-between rounded-2xl border border-black bg-orange z-10 lg:px-8 lg:rounded-full">
      <div class="override hidden px-4 md:flex justify-between -mt-3 lg:px-40">
        <div class="flex h-6 items-center bg-orange pr-6 lg:gap-x-10">
          <img alt="Right arrow" class="h-6 w-6 -translate-x-3" src="${arrowIconDataUri('right')}" />
          <div class="lg:text-2xl">The Nibgate Way</div>
        </div>
        <div class="flex h-6 items-center bg-orange pr-6 lg:gap-x-10">
          <img alt="Right arrow" class="h-6 w-6 -translate-x-3" src="${arrowIconDataUri('right')}" />
          <div class="lg:text-2xl">Start Small</div>
        </div>
      </div>
      <div class="override hidden px-4 md:flex justify-between -mb-3 lg:flex lg:px-40">
        <div class="flex h-6 items-center bg-orange pl-6 lg:gap-x-10">
          <div class="lg:text-2xl">Get Better Together</div>
          <img alt="Left arrow" class="h-6 w-6 translate-x-3 rotate-180" src="${arrowIconDataUri('left')}" />
        </div>
        <div class="flex h-6 items-center bg-orange pl-6 lg:gap-x-10">
          <div class="lg:text-2xl">Learn Quickly</div>
          <img alt="Left arrow" class="h-6 w-6 translate-x-3 rotate-180" src="${arrowIconDataUri('left')}" />
        </div>
      </div>
      <div class="override flex h-6 items-center bg-orange absolute top-0 -ml-2 pr-3 -mt-3 left-1/2 -translate-x-1/2 lg:hidden">
        <img alt="Right arrow" class="h-4 w-4 -translate-x-2 -translate-y-px" src="${arrowIconDataUri('right')}" />
        <div class="whitespace-nowrap lg:text-2xl">The Nibgate Way</div>
      </div>
      <div class="override flex h-6 items-center bg-orange absolute right-0 pr-3 origin-center rotate-90 top-1/2 -translate-y-1/2 translate-x-1/2 lg:hidden">
        <img alt="Right arrow" class="h-4 w-4 -translate-x-2 -translate-y-px" src="${arrowIconDataUri('right')}" />
        <div class="whitespace-nowrap lg:text-2xl">Start Small</div>
      </div>
      <div class="override flex h-6 items-center bg-orange absolute bottom-0 -ml-2 pl-3 -mb-3 left-1/2 -translate-x-1/2 lg:hidden">
        <div class="whitespace-nowrap lg:text-2xl">Get Better Together</div>
        <img alt="Left arrow" class="h-4 w-4 translate-x-2 translate-y-px rotate-180" src="${arrowIconDataUri('left')}" />
      </div>
      <div class="override flex h-6 items-center bg-orange absolute left-0 pr-3 origin-center -rotate-90 top-1/2 -translate-y-1/2 -translate-x-1/2 lg:hidden">
        <img alt="Right arrow" class="h-4 w-4 -translate-x-2 -translate-y-px" src="${arrowIconDataUri('right')}" />
        <div class="whitespace-nowrap lg:text-2xl">Learn Quickly</div>
      </div>
    </div>
  </div>
  <div class="max-w-4xl mx-auto text-center flex flex-col gap-4 px-8">
    <h2 class="text-4xl lg:text-5xl lg:leading-tight">
      We want you to try them, lots of them, and find out what works.
    </h2>
    <p class="text-xl max-w-2xl mx-auto">
      You don't have to be a tech expert or even understand how to start a business. You just gotta take what you know and sell it.
    </p>
    <div class="w-full mt-4">
      <a class="nibgate-soft-cta" href="${exploreOrigin}">
        Find out how
      </a>
    </div>
  </div>
</div>`;
}

export function statSection() {
  return `<div class="relative bg-gray w-full">
  <div class="flex flex-col justify-center gap-8 px-8 text-center py-20 md:items-center md:gap-16 md:pt-40">
    <h1 class="text-center text-6xl sm:text-7xl md:text-9xl lg:text-[12rem] md:leading-[0.9] font-medium">
      $2,063,216
    </h1>
    <div class="text-center text-balance text-2xl md:text-3xl max-w-2xl">
      The amount of income earned by Nibgate digital entrepreneurs last week.
    </div>
  </div>
</div>`;
}
