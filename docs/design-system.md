# Nibgate Design System

## Purpose

This document defines the visual system for Nibgate so marketing, explore, app surfaces, and future product UI feel like one product.

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
5. We use one visual language across marketing and explore, with different mood weighting:
   - marketing: lighter, more open, more narrative
   - explore: denser, darker, more utility-driven

## Core Palette

### Brand colors

- `--nib-ink: #111111`
- `--nib-paper: #F6F4EE`
- `--nib-plum: #2E1F5E`
- `--nib-olive: #7C9A6D`
- `--nib-teal: #0F766E`
- `--nib-soft: #E7EFE4`

### Usage rules

- `Ink` is the default text and border anchor.
- `Paper` is the default light background.
- `Plum` is the deepest brand tone. Use it for emphasis, dark blocks, and premium-feeling accents.
- `Olive` is the main accent. Use it for active states, featured UI, badges, and primary brand moments.
- `Teal` is the utility accent. Use it for secondary emphasis, product states, and data-flavored UI.
- `Soft` is the gentle fill. Use it for low-contrast fills, hover backgrounds, pills, and secondary CTA blocks.

### Avoid

- No borrowed marketplace pink.
- No bright candy colors unless intentionally added as a separate campaign palette.
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

- Theme toggle should behave the same on marketing and explore.
- Component contrast should be token-based, not hardcoded per page.
- Hover states should remain legible in both modes.

## Typography

### Primary font

- `ABC Favorit`

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

### Default scale

- Hero heading: `56-72px`
- Page heading: `40-56px`
- Section heading: `28-40px`
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
- Section padding: `48-96px`
- Never let cards or pills create accidental cramped gutters on mobile.

## Border Radius

- Small controls: `4px`
- Buttons and inputs: `4-6px`
- Cards: `6-8px`
- Pills: `999px`

Rule: do not exceed `8px` radius on standard cards unless the component is intentionally pill-based.

## Borders and Shadows

### Borders

- Most structure should come from `1px` borders.
- Border color should come from theme-aware tokens.

### Shadows

- Nibgate should no longer use the old hard-offset "pixel" shadow language as a default pattern.
- Prefer soft elevation with low blur and restrained opacity.
- Recommended elevation:
  - `shadow-1: 0 1px 2px rgba(17, 17, 17, 0.06)`
  - `shadow-2: 0 10px 30px rgba(17, 17, 17, 0.08)`
  - `shadow-3: 0 18px 44px rgba(17, 17, 17, 0.12)`
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

### Marketing cards

- larger breathing room
- more storytelling space
- fewer cards per row

### Explore cards

- denser
- scan-friendly
- clear image/title/meta/price structure

### Rules

- Keep image aspect ratios stable.
- Card heights should not collapse unpredictably on mobile.
- Metadata should align consistently across rows.

## Imagery

For now we use generated placeholder SVGs in the brand palette.

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

## Navigation

### Marketing nav

- clean split layout
- logo left
- route links center-left
- auth/actions right

### Explore nav

- denser utility header
- strong search presence
- category rail under the main header

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
4. Marketing and explore may differ in density, but not in brand logic.
5. If a visual choice only exists because it was copied from another marketplace, replace it with a Nibgate-native version.

## Immediate Follow-Up Work

- move current color values into a shared token source
- normalize button variants across marketing and explore
- normalize badge styles
- define standard card aspect ratios
- define icon sizing rules
- unify footer and header spacing tokens
- create a small component reference page for visual QA
- remove remaining legacy hard-outline / hard-shadow interaction styles

## Source of Truth

Until we extract tokens into shared code, this file is the design source of truth for:

- palette
- type
- spacing
- component tone
- theme behavior
