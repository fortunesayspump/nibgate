# Nibgate Design System

## Purpose

This document defines the visual system for Nibgate so home, explore, app surfaces, and future product UI feel like one product.

The goal is simple:

- creator-owned
- editorial but product-focused
- calm, structured, modern
- clear in both light and dark mode

## Brand Principles

1. Nibgate should feel like infrastructure for creators, not a playful marketplace toy.
2. Layouts should feel spacious and confident, with strong alignment and obvious hierarchy.
3. Surfaces should look useful first, decorative second.
4. Motion should support clarity, never noise.
5. We use one visual language across home and explore, with different density:
   - home: lighter, more open, narrative bands
   - explore: denser, darker by default, utility-driven
6. Nibgate should clearly mention the technical route when relevant: x402 payments on Arc testnet, with Circle Gateway as the settlement/UX layer.

## Core Palette

### Brand colors

- `--nib-ink: #111111`
- `--nib-paper: #F6F4EE`
- `--nib-olive: #7C9A6D`
- `--nib-teal: #0F766E`
- `--nib-soft: #E7EFE4`
- `--nib-black: #10110E`
- `--nib-dark: #181914`

### Usage rules

- `Ink` is the default text and border anchor.
- `Paper` is the default light background.
- `Black` / `Dark` are the product anchors. Use them for headers, dark bands, search, and dense Explore surfaces.
- `Olive` is the main accent. Use it for active states, featured UI, badges, and primary brand moments.
- `Teal` is the utility accent. Use it for secondary emphasis, product states, and data-flavored UI.
- `Soft` is the gentle fill. Use it for low-contrast fills, hover backgrounds, pills, and secondary CTA blocks.

### Avoid

- No borrowed marketplace pink.
- No bright candy colors unless intentionally added as a separate campaign palette.
- No purple footer or purple-heavy product surfaces as the default brand mood.
- No random one-off hex values for components that should use tokens.

## Theme Modes

### Light

- background: `Paper`
- text: `Ink`
- primary borders: `rgba(17, 17, 17, 0.16-0.22)`
- elevated fills: `#FFFFFF`

### Dark

- background: `#111111`
- text: `#F4F4F0`
- secondary text: `rgba(244, 244, 240, 0.72)`
- borders: `rgba(255, 255, 255, 0.18-0.24)`
- elevated fills: `#1B1B1B`

### Theme behavior

- Theme toggle should behave the same on home and explore.
- Component contrast should be token-based, not hardcoded per page.
- Hover states should remain legible in both modes.

## Typography

### Primary font

- `Kumbh Sans`

Kumbh Sans is now the core Nibgate typeface across home, explore, and app surfaces.

### Legacy/support font

- `ABC Favorit`

ABC Favorit can remain in older route pages while we migrate, but new surfaces should use Kumbh Sans through shared tokens.

### Supporting fallback stack

- `Inter`
- `-apple-system`
- `BlinkMacSystemFont`
- `"Segoe UI"`
- `sans-serif`

### Type rules

- Headlines: confident, compact, no gimmicky tracking
- Body text: readable, neutral, lightly editorial
- Labels and controls: straightforward and slightly bold
- Most headings should use `font-weight: 500`; reserve `700` for logos, badges, and deliberate emphasis.
- The home hero/header may use the stronger Kumbh display feel; below the hero, use the calmer medium-weight rhythm.

### Default scale

- Hero heading: `56-88px`
- Page heading: `48-96px`
- Section heading: `36-72px`
- Card title: `20-28px`
- Body: `16-18px`
- Small/meta: `13-14px`

### Rules

- Do not scale text with viewport width alone.
- Letter spacing stays at `0`.
- Use weight and spacing for hierarchy before adding more color.

## Spacing System

Base spacing unit: `4px`

Recommended rhythm:

- `4`
- `8`
- `12`
- `16`
- `24`
- `32`
- `48`
- `64`
- `96`

### Rules

- Tight UI: `8-16px`
- Standard component padding: `16-24px`
- Public-site narrative section padding: `80-128px`
- Explore page gutters: `24-64px`
- Never let cards or pills create accidental cramped gutters on mobile.
- Prefer split bands and full-width sections over nested cards inside cards.

## Border Radius

Use a small, strict radius scale. Do not invent new radii per component.

- `--nib-radius-control: 4px`
  Small menus, dropdown panels, small controls, tiny image frames.
- `--nib-radius-action: 6px`
  Buttons, inputs, command boxes, search bars, compact form controls.
- `--nib-radius-card: 8px`
  Product cards, content cards, repeated list cards, media tiles.
- `--nib-radius-panel: 8px`
  Larger framed product panels. Use spacing and layout for scale, not larger rounding.
- `--nib-radius-pill: 999px`
  Pills, chips, nav active states, badges, avatars, toggle tracks.

### Radius Rules

- Standard cards and panels should not exceed `8px`.
- Do not use `12px`, `16px`, `20px`, `24px`, or `32px` for normal UI containers.
- Hero art and custom illustrations may have organic shapes, but UI containers stay on the radius scale.
- Split form controls can use directional versions of the same action radius, e.g. `6px 0 0 6px`.
- Pills are only for clearly pill-shaped controls, not generic cards.

## Borders and Shadows

### Borders

- Default width: `--nib-border-width: 1px`.
- Most structure should come from `1px` borders, spacing, and contrast.
- Border color should come from theme-aware tokens such as `--nib-border-soft`, `--explore-border`, or currentColor for nav.
- Avoid thick `2px` black borders in new product/site UI. Those belong to old prototype/demo surfaces only.
- Section separation should prefer background bands and spacing over divider lines.

### Shadows

- Nibgate should no longer use the old hard-offset "pixel" shadow language as a default pattern.
- Prefer soft elevation with low blur and restrained opacity.
- Use the shared tokens:
  - `--nib-shadow-1`
  - `--nib-shadow-2`
  - `--nib-shadow-3`
- Persistent heavy shadows should be rare.
- Hard-offset shadows may survive only in temporary legacy areas while we migrate.

## Buttons

### Primary button

- fill: `Olive`
- text: `Ink`
- border: `Ink`

### Secondary button

- fill: `Soft` or `Paper`
- text: `Ink`
- border: `Ink`

### Tertiary button

- transparent or quiet fill
- used for navigation and low-emphasis actions

### Interaction

- Hover can use a subtle fill shift, border emphasis, or soft elevation.
- No rubbery or springy animation.
- Avoid stacking multiple competing effects on one button.

## Inputs and Search

- Inputs should feel sturdy and product-like.
- Search bars should read as tools, not decorative blocks.
- Dark explore search can stay black/dark-surface anchored.
- Focus state should use `Olive` as the primary highlight.

## Cards

### Site cards

- use full-width narrative bands where possible
- image half + dark text half is the current preferred pattern
- fewer floating cards; avoid stitched-together SaaS blocks

### Explore cards

- denser
- scan-friendly
- clear image/title/meta/price structure
- dark mode first, with light mode using the same warm paper/olive/black logic

### Rules

- Keep image aspect ratios stable.
- Card heights should not collapse unpredictably on mobile.
- Metadata should align consistently across rows.

## Imagery

For now we use generated placeholder SVGs in the brand palette.

### Botanical motif

Nibgate has a light botanical identity: flowers, stems, leaves, and plant-like curves can be used as brand illustrations.

The current hero flower/plant is the reference treatment, but the exact hero SVG is hero-specific and should not be reused elsewhere by default.

- vector-first, preferably SVG
- solid brand fill, usually `Olive`
- black outline layer behind the fill
- outline is created by reusing the same SVG mask/path for that specific illustration, scaling it slightly behind the fill
- no gradients for the main plant form
- no random clouds, ground shapes, or unrelated scenery unless the section truly needs it
- shape should feel smooth and premium, not clip-art or childish

Implementation pattern:

```css
.brand-plant-outline,
.brand-plant-fill {
  -webkit-mask: url("/assets/nibgate/botanical/example-plant.svg") center / contain no-repeat;
  mask: url("/assets/nibgate/botanical/example-plant.svg") center / contain no-repeat;
}

.brand-plant-outline {
  background: var(--nib-black);
  transform: scale(1.014);
}

.brand-plant-fill {
  background: var(--nib-olive);
}
```

Use botanical motif for:

- hero identity art
- section accent illustrations
- empty states
- onboarding/docs illustrations
- small brand moments around route growth, publishing, and discovery

Important: new placements need their own purpose-fit botanical SVG or illustration. Do not copy the hero flower into arbitrary page headings, product cards, or bands just to repeat the motif.

Avoid using it for:

- every card thumbnail
- dense Explore product listings
- critical UI icons
- payment/status indicators where clarity matters more than personality

### Placeholder direction

- geometric
- clean
- editorial
- abstract enough to avoid fake-stock energy

### Future image direction

- creator portraits
- product covers
- article thumbnails
- media stills

When real imagery arrives, it should still respect the Nibgate palette and contrast system.

## Product Structure

Nibgate is one web product, not separate public and app sites:

- `/` is the public homepage.
- `/explore` is the public network and product surface.
- `/signin` is the shared wallet connection doorway for creators and operators.
- The home page can show `Connect wallet` and `Connect site` because those point into the product flow, not because home itself has a separate email/password account system.

Explore code should remain segregated under `app/explore/`, but routes should mount under the main app server so local and production URLs match.

## Navigation

### Site nav

- clean split layout
- logo left
- route links center-left
- auth/actions right

### Explore nav

- denser utility header
- strong search presence
- category rail under the main header
- black header in both modes is acceptable; it ties Explore to the home hero/header.

### Rules

- Navigation should feel intentional, not crowded.
- Desktop and mobile should share the same hierarchy, only reflowed.

## Motion

Allowed motion:

- subtle hover lift
- subtle opacity changes
- subtle dropdown reveal

Avoid:

- bouncy easing
- long parallax effects everywhere
- decorative animation with no product purpose
- hard jumpy offset motion as the default interaction language

Default transition duration:

- `140ms - 180ms`

Default easing:

- `ease`
- or a restrained custom ease already in use

## Component Inventory

The system should cover:

- headers
- footers
- nav links
- theme toggle
- buttons
- search inputs
- category pills
- dropdown menus
- product cards
- featured carousel cards
- creator rows
- wishlist cards
- badges
- CTA bands
- code snippet blocks

## Implementation Rules

1. Prefer tokens over page-specific hardcoded colors.
2. If a new color is needed, add it here first.
3. Shared components should not live inside giant page files long-term.
4. Home and explore may differ in density, but not in brand logic.
5. If a visual choice only exists because it was copied from another marketplace, replace it with a Nibgate-native version.

## Immediate Follow-Up Work

- move current color values into a shared token source
- normalize button variants across home and explore
- normalize badge styles
- define standard card aspect ratios
- define icon sizing rules
- unify footer and header spacing tokens
- create a small component reference page for visual QA
- remove remaining legacy hard-outline / hard-shadow interaction styles
- migrate older route pages from ABC Favorit utility assumptions to Kumbh Sans rhythm
- create a small reusable plant/flower SVG component or asset helper so botanical art does not get duplicated by hand

## Source of Truth

Until we extract tokens into shared code, this file is the design source of truth for:

- palette
- type
- spacing
- component tone
- theme behavior
