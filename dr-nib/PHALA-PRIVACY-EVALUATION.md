# Dr. Nib: Phala privacy and cost evaluation
Verified 16 October 2026. Research and local integration only; no live deployment or inference test completed.

## Recommendation
Continue the Phala Docker integration. It fits the existing worker better than a rebuild, but moving an unchanged worker is insufficient to claim that Nibgate administrators cannot read documents. Add a confidential-inference adapter and evaluate it on public inputs before replacing existing models. Existing JEV/TypeSafe behavior remains unverified on Phala; do not silently replace it.

## Architecture and release requirements
Keep login, billing and ciphertext job coordination on Railway. Encrypt documents on the client; release per-job decryption capability only to an independently approved worker identity. Parse and analyze inside that worker, then encrypt reports, extracted text, embeddings and checkpoints before external persistence. Do not put content in logs, traces or error telemetry.

Phala's Cloud KMS explicitly trusts the developer and Phala policy. Onchain KMS makes policy visible but its owner can approve new code: a Nibgate-owned allowlist alone does not remove trust in Nibgate. Pin reviewed releases independently and require user-controlled or separately governed key release. Document how upgrades and recovery work; a Nibgate-held universal recovery key defeats the claim.
Sources: [KMS choices](https://docs.phala.com/phala-cloud/key-management/cloud-vs-onchain-kms), [Onchain KMS](https://docs.phala.com/phala-cloud/key-management/understanding-onchain-kms).

Require production OS measurements, approved compose hashes and digest-pinned containers. Validate quote signatures, current TCB, event-log measurements, nonce/session-public-key binding and the complete KMS/network chain. Attestation identifies executing code; it does not establish that the code is safe.
Source: [Complete chain of trust](https://docs.phala.com/phala-cloud/attestation/chain-of-trust).

Development images support root SSH; account keys can be installed on new CVMs and DSTACK_ROOT_PUBLIC_KEY updated. Production document processing must reject development/debug identities and plaintext administrative paths. Do not treat hiding a dashboard button as protection.
Source: [SSH access](https://docs.phala.com/phala-cloud/networking/enable-ssh-access).

A remaining client-side limitation is fundamental: if Nibgate can silently replace browser JavaScript, it could capture a document before encryption. An independently verifiable client/release mechanism is necessary for a strong malicious-operator claim. Customer-controlled recovery must be designed explicitly, including lost-key and restart behavior. Hardware vulnerabilities, application bugs, metadata exposure and denial of service remain residual risks.

## Private AI is a separate service
Calling inference.phala.com does not automatically guarantee a confidential upstream. Require provider:{aci_verified:true,zdr:true}; never weaken these constraints on retry. The first constrains the verified upstream execution/channel; the second constrains retention. Unavailable compliant routes must fail closed.
Source: [Attested routing](https://docs.phala.com/phala-cloud/confidential-ai/confidential-model/attested-routing).

Phala states that its gateway stores no prompt/completion bodies; receipts contain hashes and verification facts. Upstream ZDR is backed by policy/contract, not proven by attestation. A TEE could still run code that writes logs. Plaintext necessarily exists inside the approved processing environments. Do not equate zero retention, no training and operator blindness without checking each claim.
Source: [Zero data retention](https://docs.phala.com/phala-cloud/confidential-ai/confidential-model/zero-data-retention), [Trust boundary](https://docs.phala.com/phala-cloud/confidential-ai/confidential-model/trust-boundary).

For Node, the official ESM @phala/aci-verifier supports Node >=20.18.1. connectAci from @phala/aci-verifier/runtime verifies nonce-bound identity and creates an SPKI-pinned TLS transport. Use requireProductionOs and an authenticated acceptedComposeHashes allowlist, serving.requireVerified and requireReceipt, then explicitly call verifyReceipt after consuming each result. The low-level client does not automatically audit receipts. Browser JavaScript cannot enforce equivalent TLS SPKI pinning. Pair compose appraisal with a valid dstack verifier result as the documentation requires.
Source: [TypeScript verifier](https://docs.phala.com/phala-cloud/confidential-ai/verify/typescript-sdk).

## Advertised inference prices
- [GPT-OSS-120B](https://phala.com/models/openai/gpt-oss-120b): $0.15 per million input tokens, $0.60 per million output tokens. Tools and JSON mode listed; 131K context.
- [GLM-5.3-Flash](https://phala.com/models/z-ai/glm-5.3-flash): $0.15 input, $0.50 output per million; tools and JSON mode listed; 1M context.
- [DeepSeek V3.2](https://phala.com/models/deepseek/deepseek-v3.2): $1 input and $1 output per million; tools and JSON mode listed.

Illustrative GPT-OSS job totaling 100,000 input and 10,000 output tokens across all calls costs $0.021 for inference. This is arithmetic, not a measured research workload; repeated contexts, reasoning tokens, tool/API charges and worker hosting can add cost. Catalog capabilities do not establish current live availability with aci_verified + zdr + tool calling together. That combination has not been tested. JSON mode does not establish strict schema compliance or research quality.

## Worker cost controls
The smallest listed CVM is $0.06/hour plus $0.000139/GB/hour storage. With 20GB retained for 30 days, continuously running compute plus disk is about $45.20 before AI. Compute stops billing when stopped, but retained disk continues. Phala describes this as VMs, not serverless. There is no verified automatic scale-to-zero or guaranteed cold-start duration.

A queue controller can start the VM, wait for readiness and re-attestation, process a bounded batch, encrypt checkpoints and shut down gracefully. At these prices, a $5 credit would cover roughly 50 running hours over a 30-day period with 20GB disk retained, before other charges; compute alone would last 83.3 hours. Gifted promotional credits cannot pay Private AI. Purchased Balance is separate in eligibility. Dashboard credit type and current offer must be checked.
Sources: [Pricing](https://phala.com/pricing), [Cloud FAQ](https://docs.phala.com/phala-cloud/faqs), [Lifecycle API](https://docs.phala.com/phala-cloud/references/cloud-python-sdk/cvm-lifecycle).

## Alternatives and launch wording
Tinfoil is a credible managed Docker and confidential-inference alternative. Its private secrets and encrypted persistent storage are documented as V3 beta; exact suitable CPU pricing was not established. There is insufficient evidence to reverse the user's Phala choice.
Source: [Tinfoil containers](https://docs.tinfoil.sh/containers/overview).

Until real attestation, key release, recovery, client delivery, all downstream processors and encrypted outputs are tested, use: “Confidential-processing integration in development.” Do not market an unconditional “Nibgate cannot read your documents.” If conventional external AI remains, disclose that selected providers receive content needed for analysis under their stated policies. A no-training promise alone does not mean they cannot access or retain the content.
