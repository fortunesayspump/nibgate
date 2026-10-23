import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = dirname(fileURLToPath(import.meta.url));
const referenceRoot = resolve(skillRoot, "..");
const docsRoot = resolve(referenceRoot, "..");
const expectedCommit = "345fc04b984f01366cbe2a9f4064f22268d5d3f6";
const commit = process.env.RUNX_INPUT_COMMIT ?? "";

if (commit !== expectedCommit) {
  throw new Error(`Expected pinned commit ${expectedCommit}, received ${commit}`);
}

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

run("npm", ["run", "build"], referenceRoot);
run("npm", ["test"], referenceRoot);
run("npm", ["run", "check:examples"], referenceRoot);
run("node", ["scripts/stage-sdk-reference.mjs"], docsRoot);

const validation = JSON.parse(
  readFileSync(resolve(referenceRoot, "evidence/validation.json"), "utf8"),
);
const packageJson = JSON.parse(
  readFileSync(resolve(referenceRoot, "package.json"), "utf8"),
);
const runxVersion = run(
  resolve(referenceRoot, "node_modules/.bin/runx"),
  ["--version"],
  referenceRoot,
).trim();
const routes = JSON.parse(
  readFileSync(resolve(docsRoot, ".next/routes-manifest.json"), "utf8"),
);
const sdkRewrite = routes.rewrites?.beforeFiles?.find(
  (entry) =>
    entry.source === "/sdk-reference" &&
    entry.destination === "/sdk-reference/index.html",
);

if (!sdkRewrite || !existsSync(resolve(docsRoot, "public/sdk-reference/index.html"))) {
  throw new Error("The successful Nextra build does not contain the Sourcey route integration");
}

process.stdout.write(`${JSON.stringify({
  status: "passed",
  commit,
  runxVersion,
  sourceyVersion: packageJson.devDependencies.sourcey,
  documentedApis: validation.documentedApis,
  clientMethods: validation.clientMethods,
  standaloneFunctions: validation.standaloneFunctions,
  checkedLocalLinks: validation.checkedLocalLinks,
  nextraIntegration: "passed against successful production build manifest",
  livePaymentsExecuted: false,
})}\n`);
