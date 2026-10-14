// Build-time constants injected by esbuild `define` (scripts/build.mjs).
// Optional dev/staging hub override: NIBGATE_HUB_API=... npm run build
declare const __NIBGATE_HUB_API__: string;
declare module '*.svg' {
  const svg: string;
  export default svg;
}
