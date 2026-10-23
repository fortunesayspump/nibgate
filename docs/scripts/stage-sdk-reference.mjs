import { cpSync, existsSync, rmSync } from "node:fs";
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

console.log(`Staged Sourcey SDK reference at ${target}`);
