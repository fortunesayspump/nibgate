# Guest planning UI fixture — synthetic data only

`../../drnib-guest-browser.e2e.mjs` bundles the actual research page against this
explicitly mocked guest API/auth/storage boundary. The mock plan, account,
question, answer and prices are **test data**, not a production demo or evidence
of real worker inference. All non-local browser requests are blocked.

Use the optional test dependencies and browser instructions in
`../drnib-signin/README.md`, then run from the repository root:

```sh
node --test scripts/drnib-guest-browser.e2e.mjs
```

The `SIGNIN_TEST_NODE_MODULES`, `CHROMIUM_PATH`, `SIGNIN_TEST_CSS`, and
`SIGNIN_TEST_SCREENSHOTS` environment variables work as for the sign-in suite.
The tests cover desktop/mobile guest intake/configuration/planning, cancellation,
explicit adoption without automatic funding, private-file gating, stale/missing
plan validation, adoption failure, repeated clicks, failed account verification,
autosave/reload, offline restore, storage failure and authenticated redirect return.

Reload cases inject a saved **synthetic boundary snapshot** on the next page load;
they prove UI restoration behavior, not IndexedDB encryption. Real encrypted
storage, CryptoKey handling, locks, CAS, worker transport, budget policy,
re-encryption and adoption idempotency require the separate module/backend tests.
The browser auth dialog and escrow control are test doubles: no actual Google,
wallet, funding, model, private-file or research operation occurs.

## Bounded UX state and keyboard coverage

The `guest visual` tests capture intake loading, plan loading, retained-intake
error, cancelled sign-in and browser-storage failure at 1280px and 390px. Set
`SIGNIN_TEST_CSS` to the current generated production main stylesheet and
`SIGNIN_TEST_SCREENSHOTS` to a local output folder. Screenshots must be visually
inspected; passing overflow/role assertions alone is not visual QA. This guest
harness renders the production icon package as well as production page markup.

Additional `guest polish` regressions cover native choice keyboard navigation,
Other answers, report-length radio keys, output pressed states, one-step editing,
account-storage fallback, expired restore guidance, immediate unsaved-revision
status and explicit retained-intake retry. Auth, model, storage and escrow remain
synthetic boundaries; the full application header/sidebar is not rendered.
