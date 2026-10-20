# Private guest packaging

Build from the repository root using `docker build -f dr-nib/private-guest/Dockerfile --build-arg NODE_IMAGE=node@sha256:<reviewed-digest> .`. No default base digest is invented here. A reviewed registry digest, reproducible dependency closure, compose measurement, independent verifier policy and egress controls are mandatory before deployment.

The guest receives the database URL, private ciphertext bucket credentials, approved ACI model/compose policy, broker verification public key and enforced budget limits. It never receives the broker signing private key or a permanent client decryption key. Client keys arrive in one-use HPKE sessions. `DRNIB_PRIVATE_WORKFLOW_ENABLED=true` enables the owner-scoped rehearsal only; it does not enable public payments or attest to release readiness.

Do not mount the Docker socket, host home directory or application source tree into the guest. The dstack attestation socket is a production runtime integration. No local Docker container is a substitute for hardware attestation. The browser policy must be reviewed against the exact built image and compose before keys are released.

No deployment or remote build is performed by the local test suite. See [release gates](../privacy/PLAN.md).
