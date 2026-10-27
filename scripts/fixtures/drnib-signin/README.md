# Isolated research sign-in regression tests

These tests render the **real** `frontend/src/app/dr-nib/research/page.tsx`.
Only boundary modules (research storage/API, wallet hook, router, unrelated
source/escrow widgets, and icons) are replaced by explicitly synthetic fixtures.
No real account, OAuth permission, wallet signature, payment, private key, or
research request is used. Browser requests outside the local test server are blocked.

## Run

From the repository root (Node 22.18+ for native TypeScript stripping):

```sh
node --test scripts/drnib-signin-submission.test.mjs
npm ci --prefix scripts/fixtures/drnib-signin --workspaces=false
node --test scripts/drnib-signin-dom.e2e.mjs
# Install the locked Playwright browser, or set CHROMIUM_PATH to an existing one.
node scripts/fixtures/drnib-signin/node_modules/playwright/cli.js install chromium
node --test scripts/drnib-signin-browser.e2e.mjs
```

The isolated package pins optional test dependencies without changing the
workspace lockfile. Alternatively set `SIGNIN_TEST_NODE_MODULES` to an existing
node_modules containing those packages. React and ReactDOM resolve from the installed frontend dependencies to test the production React version and prevent multiple instances. Install workspace dependencies first.

For styling/visual checks, first build the frontend, then set `SIGNIN_TEST_CSS`
to its generated main Tailwind/site CSS chunk and `SIGNIN_TEST_SCREENSHOTS` to an
output directory. Font files are read from `frontend/public/fonts` locally.
The harness uses the existing root light-theme attributes and site/content
wrapper classes. It does not recreate or validate the full header/sidebar.

```sh
SIGNIN_TEST_CSS="$PWD/frontend/.next/static/chunks/<main-style-chunk>.css" \
SIGNIN_TEST_SCREENSHOTS=/tmp/drnib-signin-qa \
CHROMIUM_PATH=/path/to/approved/chrome-headless-shell \
node --test scripts/drnib-signin-browser.e2e.mjs
```

## Coverage and limits

- 13 controller tests: private401/ordinary auth errors, fresh/already-authenticated,
  cancellation, rejection, duplicate clicks, edits, unmount, stale responses,
  post-mutation401, outages and no retry/signature loop.
- Six real-page DOM tests: draft preservation, cancel/retry, accessible CTA focus,
  edits, repeated Enter, expiry and mutation401.
- Nine real-page browser tests: desktop1280/mobile390 viewport sign-in and
  cancel/retry, edits, second401, already-authenticated, repeated Enter, unmount.
  When screenshots are enabled, both viewports assert no horizontal overflow.

The dialog itself is a **test double**, not AppKit. These tests cannot establish
Google OAuth, real wallet connector behavior, SIWE signing, provider reconciliation,
real server cookie propagation, or full-app navigation/layout correctness.
No production submission or payment is run. The controller's unmount behavior
is verified in both unit and browser tests; jsdom covers the other six UI cases.

## Pull-request CI

`.github/workflows/guest-planning.yml` runs on scoped PR changes (or manual dispatch),
with Node 22, frozen workspace pnpm dependencies and this fixture's npm lockfile.
It checks backend privacy, client/auth logic, a disposable local PostgreSQL cluster,
and these desktop/mobile/IndexedDB tests against freshly built production CSS.
It has only read permission, no deployment or secret inputs, and no live account,
wallet, model or payment calls. Browser screenshots are temporary test outputs,
not a replacement for human visual review. The existing manual CI is unchanged.
