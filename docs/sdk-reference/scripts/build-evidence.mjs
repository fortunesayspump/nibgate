import { readFileSync, writeFileSync } from "node:fs";

const inventory = JSON.parse(readFileSync("inventory.json", "utf8"));
const validation = JSON.parse(readFileSync("evidence/validation.json", "utf8"));
const routeProbe = JSON.parse(readFileSync("evidence/local-route-probe.json", "utf8"));
const receiptRef = "runx:receipt:sha256:3e31504c89cde15256caa3d827800692195e0e13d4a62029e21190be0604ae32";

const evidence = {
  schema: "nibgate.sourcey.bounty-evidence.v1",
  summary: "Sourcey 3.9.0 generated and validated a source-mapped @nibgate/sdk 0.4.40 reference for 27 runtime NibgateClient methods plus the standalone validateResourceMetadata export at the pinned public commit. The additive Nextra production build passed and the official production routes are live.",
  public_url: "https://docs.nibgate.xyz/sdk-reference",
  publication_status: "published and verified on the official Nibgate documentation domain",
  receipt_ref: receiptRef,
  receipt_file: "evidence/receipt.json",
  report: "report.md",
  artifacts: {
    inventory: "inventory.json",
    validation: "evidence/validation.json",
    build_hashes: "evidence/build-hashes.json",
    strict_type_errors: "evidence/upstream-types.txt",
    nextra_build: "evidence/nextra-build.json",
    local_route_probe: "evidence/local-route-probe.json",
    receipt_verification: "evidence/receipt-verification.json",
  },
  repository: {
    url: "https://github.com/fortunesayspump/nibgate",
    commit: inventory.commit,
    package: inventory.package,
    version: inventory.version,
    license: inventory.license,
    license_note: "The pinned package.json declares MIT; the repository has no root or package-level LICENSE file at this commit.",
    recent_package_activity: "4bc912b7fd8ea0c232d2448c680f9face0246f0a committed 2026-10-20T23:17:54+01:00",
    tracked_package_source_files: 56,
  },
  sourcey: {
    version: "3.9.0",
    adapter: "markdown",
    config: "sourcey.config.ts",
    source_generation: "scripts/generate.mjs",
    command: "npm run build",
    base_url: "/sdk-reference",
    site_url: "https://docs.nibgate.xyz",
  },
  coverage: {
    documented_api_pages: inventory.total,
    runtime_client_methods: inventory.clientMethods,
    standalone_functions: inventory.standaloneFunctions,
    declared_client_members: 28,
    discrepancy: "validateResourceMetadata is declared on NibgateClient but is only a standalone runtime export.",
    pages: inventory.pages.map((page) => ({
      name: page.name,
      kind: page.kind,
      path: page.page,
      declaration: page.declaration,
      implementation: page.implementation,
    })),
    limits: "Selected browser SDK surface; does not claim complete coverage of server, tracking, testing, wallet, tip, or internal helper exports.",
  },
  validation: {
    ...validation,
    sourcey_pages_reported_by_build: 30,
    nextra_production_build: "passed (56 static/dynamic routes generated; Pagefind indexed 50 pages)",
    local_route_probe: routeProbe,
    strict_declaration_check: "failed as expected with six missing-transfer-type errors; see evidence/upstream-types.txt",
    receipt_verification: "valid digest, content address, and local Ed25519 signature",
    production_deployment: "The Git-integrated Vercel production deployment reached READY on docs.nibgate.xyz; final live route and responsive-layout checks passed without replacing the existing Nextra documentation.",
  },
  commands: [
    "node --version",
    "npm run build",
    "npm test",
    "npm run check:examples",
    "npm exec -- tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext examples.ts",
    "npm run build (from docs/, exercising Sourcey prebuild, staging, Next.js and Pagefind)",
    "runx skill ./runx-validator --run-id nibgate-sourcey-345fc04b-final-style-v5 -i commit=345fc04b984f01366cbe2a9f4064f22268d5d3f6 --json",
    `runx verify --receipt evidence/receipt.json --json`,
  ],
  observations: [
    "runx --version output: runx-cli 0.10.2",
    "Node.js output: v22.22.0, satisfying Sourcey README's Node 22.19+ requirement.",
    "The public source is pinned to 345fc04b984f01366cbe2a9f4064f22268d5d3f6; the generator rejects any checked source file that differs from the 14-file SHA-256 manifest derived from that commit.",
    "Sourcey built 30 navigable pages, including 28 documented API entries: 27 runtime client methods and one standalone helper.",
    "The generated inventory maps every documented API to a declaration line and implementation source; 14 distinct pinned source files were hashed.",
    "Validation checked 1,106 local href/src references and all 28 API pages for name, pinned commit, and example content.",
    "The full existing Nextra production build passed after staging Sourcey under docs/public/sdk-reference; Pagefind indexed 50 existing Nextra pages.",
    "Local requests returned HTTP 200 for /sdk-reference, a generated API page, and a generated Sourcey asset.",
    "Production HTTP checks returned 200 for the Sourcey root, two representative API pages, Markdown output, llms.txt, JavaScript, CSS, search data, the Nextra home page, and the existing API reference page.",
    "Strict TypeScript checking without skipLibCheck failed on six references to two missing transfer types; the errors are preserved rather than hidden.",
    "Examples were compile-checked with skipLibCheck only because of those upstream declaration defects; no live wallet, RPC, payment, transfer, or financial operation was executed.",
    "The sealed receipt reference is runx:receipt:sha256:3e31504c89cde15256caa3d827800692195e0e13d4a62029e21190be0604ae32 from the fresh successful v5 governed validation of the final reviewed styling and Nextra integration.",
    "The SDK package metadata declares MIT, while the pinned repository lacks a license text file; this remains a reviewer-visible acceptance risk.",
  ],
  source_hashes: inventory.sourceHashes,
};

writeFileSync("evidence/evidence.json", `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ receipt_ref: receiptRef, observations: evidence.observations.length, pages: evidence.coverage.pages.length }));
