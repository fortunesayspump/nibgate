---
name: validate-nibgate-sourcey-reference
description: Rebuild and validate the pinned Nibgate SDK Sourcey reference and its additive Nextra integration.
---

# Validate the Nibgate Sourcey reference

Rebuild the Sourcey documentation from the pinned SDK sources, validate its
coverage and internal links, then build the existing Nextra documentation site
with the generated reference staged beneath `/sdk-reference`.

The runner performs no network payment, wallet, deployment, claim, or bounty
submission operation. It returns a compact JSON validation result suitable for
a sealed runx receipt.
