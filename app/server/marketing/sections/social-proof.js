import { imagePath } from '../assets.js';
import { exploreOrigin, testimonials } from '../data.js';

const quoteIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" class="w-5 h-3" aria-hidden="true"><path d="m21.01,10h-2.85c.27-1.02,1.01-2.51,3.09-3.03l.76-.19v-2.78h-1c-2.78,0-4.91.77-6.31,2.29-1.89,2.05-1.7,4.68-1.69,4.71v7c0,1.1.9,2,2,2h6c1.1,0,2-.9,2-2v-6c0-1.1-.9-2-2-2Z"/><path d="m9.01,10h-2.85c.27-1.02,1.01-2.51,3.09-3.03l.76-.19v-2.78h-1c-2.78,0-4.91.77-6.31,2.29-1.89,2.05-1.7,4.68-1.69,4.71v7c0,1.1.9,2,2,2h6c1.1,0,2-.9,2-2v-6c0-1.1-.9-2-2-2Z"/></svg>`;

function testimonialCard(item) {
  return `<div class="space-y-6">
  <div class="bg-white border border-dark-gray/50 rounded-3xl px-8 py-4 relative rounded-tl-3xl rounded-tr-3xl rounded-br-3xl rounded-bl-sm">
    <div class="mb-4">
      ${quoteIcon}
    </div>
    <p class="text-black text-xl leading-relaxed font-medium">
      ${item.quote}
    </p>
  </div>
  <div class="flex items-center gap-4 pl-2">
    <div class="rounded-full p-1">
      <div class="w-12 h-12 rounded-full bg-white flex items-center justify-center overflow-hidden">
        <img alt="${item.name}" class="w-full h-full object-cover rounded-full" src="${imagePath(`creators/${item.image}`)}" />
      </div>
    </div>
    <div>
      <h3 class="font-bold text-black text-lg">${item.name}</h3>
      <p class="text-black text-sm">${item.role}</p>
    </div>
  </div>
</div>`;
}

export function testimonialsSection() {
  return `<div class="grid grid-cols-1 lg:grid-cols-2 bg-gray max-w-6xl mx-auto px-4 gap-x-8 gap-y-12" aria-label="Creator stories">
  ${testimonials.map(testimonialCard).join('')}
</div>`;
}

function categoryChip([icon, label]) {
  return `<div class="shrink-0 mr-3 flex gap-3 justify-center items-center h-auto">
  <img alt="" loading="lazy" class="w-12 h-auto md:w-20 shrink-0" src="${imagePath(`discover/${icon}`)}" />
  <a class="nibgate-chip-link md:text-2xl" href="${exploreOrigin}">${label}</a>
</div>`;
}

const categoryRows = [
  [
    ['animation.svg', 'blender'],
    ['audio.svg', 'meditation'],
    ['comics.svg', 'comic'],
    ['software.svg', 'notion template'],
    ['design.svg', 'textures'],
    ['drawing.svg', 'procreate'],
    ['animation.svg', '3d model'],
    ['audio.svg', 'hypnosis'],
    ['comics.svg', 'manga'],
    ['software.svg', 'investing'],
    ['design.svg', 'mockup'],
    ['drawing.svg', 'brushes'],
    ['animation.svg', 'spark ar'],
    ['audio.svg', 'subliminal messages'],
    ['comics.svg', 'anime'],
    ['design.svg', 'instagram'],
    ['design.svg', 'font']
  ],
  [
    ['drawing.svg', 'art'],
    ['film.svg', 'after effects'],
    ['education.svg', 'education'],
    ['sports.svg', 'fitness'],
    ['writing.svg', 'sci-fi'],
    ['games.svg', 'vrchat'],
    ['music.svg', 'ableton'],
    ['education.svg', 'certification exams'],
    ['film.svg', 'vj loops'],
    ['sports.svg', 'workout program'],
    ['writing.svg', 'poetry'],
    ['games.svg', 'avatar'],
    ['music.svg', 'sample pack'],
    ['education.svg', 'learning'],
    ['film.svg', 'luts'],
    ['sports.svg', 'yoga'],
    ['writing.svg', 'fiction'],
    ['games.svg', 'assets'],
    ['music.svg', 'sheet music']
  ],
  [
    ['photography.svg', 'reference photos'],
    ['drawing.svg', 'coloring page'],
    ['music.svg', 'singles'],
    ['software.svg', 'programming'],
    ['writing.svg', 'kdp interior'],
    ['photography.svg', 'stock photos'],
    ['crafts.svg', 'printable'],
    ['music.svg', 'jazz'],
    ['software.svg', 'windows'],
    ['writing.svg', 'ebook'],
    ['photography.svg', 'photobash'],
    ['software.svg', 'productivity'],
    ['music.svg', 'instrumental music'],
    ['software.svg', 'theme'],
    ['writing.svg', 'low content books']
  ]
];

function categoryTrack(items) {
  const doubledItems = [...items, ...items].map(categoryChip).join('');
  return `<div class="nibgate-marquee-track flex w-[200%] group-hover:[animation-play-state:paused] motion-safe:animate-[marquee_20s_linear_infinite] motion-safe:md:animate-[marquee_60s_linear_infinite] motion-reduce:animate-none">
    ${doubledItems}
</div>`;
}

export function possibilitiesSection() {
  return `<div class="flex flex-col gap-16 py-16 lg:py-64 lg:gap-24">
  <div class="flex flex-col justify-center px-8 lg:px-[4vw] gap-6 mx-auto text-center max-w-5xl">
    <h2 class="text-5xl md:text-6xl lg:text-7xl">Unlimited possibilities</h2>
    <p class="text-xl md:text-2xl">Explore the best-selling products and creators on Nibgate</p>
  </div>
  <div class="nibgate-marquee group flex flex-wrap gap-x-4 gap-y-6 justify-center" role="list">
    ${categoryRows.map(categoryTrack).join('')}
  </div>
</div>`;
}
