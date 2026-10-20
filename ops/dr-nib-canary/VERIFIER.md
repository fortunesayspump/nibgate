# Official Phala verifier selection

Use the official **dstack-verifier 0.6.1** engine with our evidence-only CORS gateway. The pinned engine is already selected by `verifier/engine.Dockerfile`; no custom cryptographic verifier or paid verifier product is needed. `verifier/selection.json` records the source links and public endpoint checks. This decision changes neither the browser key-release policy nor model routing.

## Options and decision

| Option | Purpose | Decision |
| --- | --- | --- |
| [Official dstack-verifier](https://github.com/Dstack-TEE/dstack/blob/v0.6.1/dstack/verifier/README.md) | Hardware quote, runtime event log, OS boot measurement reconstruction and decoded policy inputs | Selected; full `/verify` protocol matches our clients |
| [Phala hosted quote API](https://github.com/Phala-Network/phala-cloud/blob/main/skills/usecase/verify-attestation.md) | Accepts `{hex}` at `https://cloud-api.phala.com/api/v1/attestations/verify` | Not a drop-in full-verification endpoint; its documented quote verdict does not establish OS boot reconstruction |
| [Phala Trust Center](https://github.com/Phala-Network/trust-center) | Human-readable application/KMS/gateway verification and source review | Useful supplemental release evidence; not accepted as a substitute for our fresh session challenge |
| DCAP JS/WASM alone | Local Intel quote verification | Insufficient alone: still needs OS reconstruction and release policy checks |

The [official security release](https://github.com/Dstack-TEE/dstack/releases/tag/v0.6.1) publishes the exact engine digest in `engine.Dockerfile`. Version 0.6.1 fixes attestation/VM-configuration consistency. Do not replace it with a moving `latest` tag. An engine upgrade does not approve a new guest OS or KMS identity; those remain independently reviewed release inputs.

On 2026-10-20, an unauthenticated synthetic `{hex:"00"}` request to the documented hosted API was rejected with HTTP 400. Its OPTIONS request for the proposed canary frontend returned HTTP 204 without `Access-Control-Allow-Origin`. This confirms malformed-input rejection, not positive verification. We did not find a documented Phala-operated full-verifier endpoint with the required browser contract. Do not invent a hostname, proxy the quote-only result into a full verdict, or disable failed checks to adopt it. A future documented compatible hosted service may replace hosting after the same acceptance review.

## Trust boundary and setup

Nibgate reuses its existing official engine and evidence-only HTTPS gateway in the testnet Railway project. No new verifier project or pair is selected. The engine has no research, storage, wallet or lifecycle credentials and no public domain. Its internal URL is `http://drnib-qa-verifier.railway.internal:8080/verify`. The gateway retains `https://drnib-qa-verifier-gateway-production.up.railway.app`; its reviewed canary-origin/image update remains staged after deployment-tool cancellation. Exact CORS, TLS SPKI and live full-verdict acceptance are still required.

`verifierTrustMode: "operator-hosted"` and the build-time `NEXT_PUBLIC_DRNIB_PRIVATE_VERIFIER_TRUST_MODE=operator-hosted` deliberately allow this Nibgate hostname. Omitting the build flag retains the stricter legacy independent mode; unknown values fail closed. The origin remains distinct from the frontend, broker, funding and guest. Browser policy never learns the verifier URL or release pins from the guest. The broker retains TLS CA/hostname validation and its reviewed SPKI pin.

A separate operator is not required by Phala. It was a stronger policy choice, not a cryptographic property supplied by the official image. The selected setup explicitly trusts Nibgate and Railway for verifier operation. A compromised service operator could fabricate a JSON verdict; digest pinning and TLS/SPKI do not prevent that operator from changing its service. The browser still enforces every full-verdict field and live key-possession proof, but those cannot by themselves make a forged hardware verdict trustworthy. Do not describe this as verification independent of Nibgate. Independent operation or a reviewed fully local verification chain would be stronger alternatives, not prerequisites for this disclosed operator-trusted setup.

The verifier receives hardware evidence and opaque session-bound report data, never documents, prompts, project keys, wallet cookies or model credentials.

For a fresh installation, `verifier/.railway/railway.ts` describes an optional pair. The selected reuse bundle disables project creation and updates existing services. Only the gateway is publicly exposed. Set its private upstream `/verify` URL and exact browser-origin allowlist. Review TLS/SPKI, provider resource limits and logs policy. Prewarm the accepted OS-image cache and test first-verification latency before admitting users: full legacy TDX verification may need a large OS-image download, while the client and gateway currently time out after ten seconds. `/health` only establishes transport configuration. Verify real and tampered evidence end to end before accepting the endpoint; do not increase timeouts or skip boot verification without review.

The remaining verifier inputs are activation of the selected HTTPS origin and its certificate SPKI, plus live acceptance evidence. No certificate pin can safely be filled before that endpoint exists. Trust Center deployment reports can be linked once the new CVM exists; they are not fabricated locally.

## Local transport recipe

`verifier/compose.local.yaml` prepares the exact official engine plus the previously checked local gateway image. Only the gateway binds `127.0.0.1:18080`; the engine remains internal. Both image pulls are disabled. With the Docker Compose plugin installed, configuration inspection does not start containers:

```sh
docker compose -f ops/dr-nib-canary/verifier/compose.local.yaml config --quiet
```

The Compose plugin was unavailable on this device; the YAML and its image, network and port constraints were checked locally using the installed YAML parser instead. Starting this optional rehearsal requires locally cached images. The official engine was not cached during this review, so no engine pull or start was performed. A future deliberate start can download public Intel collateral and official OS-image measurement material; disk cache and outbound bandwidth require capacity. Stop the pair after inspection. This loopback rehearsal is not a browser-approved production trust endpoint, does not establish independent operation and supplies no deployment pins.

## Costs

The official open-source engine needs no separate software purchase. Running it still consumes hosting CPU/RAM, cache disk and egress; these remain included in the control/verifier estimate in `costs.json`. No free hosted-service quota or SLA is assumed. Selecting the official engine does not remove these costs. The selected rollout has a separate owner-approved $5 incremental testnet allowance; software selection itself adds no verifier license cost.
