import { copyFileSync, cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(docsRoot, "sdk-reference/dist");
const target = resolve(docsRoot, "public/sdk-reference");

if (!existsSync(resolve(source, "index.html"))) {
  throw new Error("Sourcey output is missing sdk-reference/dist/index.html");
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
copyFileSync(resolve(source, "pages/introduction.html"), resolve(target, "index.html"));

const sourceyFooterStart = '<div class="mt-16 mb-8 flex flex-wrap items-center justify-between';
const searchDialog = '<dialog id="search-dialog"';
const headEnd = "</head>";
const siteIcons = '<link rel="shortcut icon" href="/brand/nibgate-mark.svg"/><link rel="apple-touch-icon" href="/brand/nibgate-mark.svg"/>';
const siteFooter = `<div class="nib-sourcey-footer-shell"><footer class="nib-sourcey-footer"><div class="nib-sourcey-footer-inner"><span>Nibgate docs. Built for creator-owned paid routes.</span><nav aria-label="Nibgate links"><a href="https://nibgate.xyz">Main site</a><a href="https://nibgate.xyz/explore">Explore</a><a href="https://nibgate.xyz/get-started">Get started</a><a href="https://github.com/fortunesayspump/nibgate">GitHub</a></nav></div></footer></div>`;

function removeElementAt(html, start) {
  const token = /<div\b|<\/div>/g;
  token.lastIndex = start;
  let depth = 0;
  let match;

  while ((match = token.exec(html))) {
    depth += match[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(0, start) + html.slice(token.lastIndex);
  }

  throw new Error("Could not isolate Sourcey's article footer");
}

function integrateSiteShell(path) {
  let html = readFileSync(path, "utf8");
  if (!html.includes(headEnd)) throw new Error(`Sourcey document head missing from ${path}`);
  html = html.replace(headEnd, siteIcons + headEnd);
  const footerStart = html.indexOf(sourceyFooterStart);
  if (footerStart === -1) {
    writeFileSync(path, html);
    return;
  }
  html = removeElementAt(html, footerStart);

  const dialogStart = html.indexOf(searchDialog);
  if (dialogStart === -1) throw new Error(`Sourcey search dialog missing from ${path}`);
  html = html.slice(0, dialogStart) + siteFooter + html.slice(dialogStart);
  writeFileSync(path, html);
}

function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) walk(child);
    else if (entry.isFile() && entry.name.endsWith(".html")) integrateSiteShell(child);
  }
}

walk(target);

console.log(`Staged Sourcey SDK reference at ${target}`);
