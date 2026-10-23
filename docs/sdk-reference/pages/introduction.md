---
title: SDK reference
description: Source-mapped Nibgate SDK 0.4.40 reference.
---

# Nibgate SDK reference

A source-generated companion to the [Nibgate guides](https://docs.nibgate.xyz). Covers **27 implemented client methods and one standalone metadata validator**, extracted from SDK 0.4.40 at [345fc04](https://github.com/fortunesayspump/nibgate/tree/345fc04b984f01366cbe2a9f4064f22268d5d3f6/).

Built with Sourcey 3.9.0 using its Markdown adapter. Exact signatures come from the TypeScript declarations; behavior notes and examples are checked against the JavaScript implementation. This is a selected browser SDK reference, not full coverage of server, tracking, testing, wallet or tip APIs.

## Start

```sh
npm install @nibgate/sdk@0.4.40
```

```typescript
import { createNibgate, validateResourceMetadata } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1' };
const validation = validateResourceMetadata(resource);
client.content(validation.resource);
```

Events are telemetry. Keep protected content behind server verification; emitting unlockCompleted is not proof of payment. Browser event methods return false when queued or when no browser exists. Payment examples require app-provided wallet callbacks and must run only on intentional user action.

## Coverage and known issues

The declaration contains 28 client methods but validateResourceMetadata is not wired into the client at runtime; import it separately. Transfer types are referenced but undeclared. The rating UI click handler has a boolean/Promise mismatch. Read each method's notes before use.

- [gate](api/gate.html) — client-method
- [content](api/content.html) — client-method
- [registerContent](api/registercontent.html) — client-method
- [view](api/view.html) — client-method
- [track](api/track.html) — client-method
- [unlockStarted](api/unlockstarted.html) — client-method
- [unlockCompleted](api/unlockcompleted.html) — client-method
- [paymentCompleted](api/paymentcompleted.html) — client-method
- [rateResource](api/rateresource.html) — client-method
- [trackResourcePage](api/trackresourcepage.html) — client-method
- [checkResourceAccess](api/checkresourceaccess.html) — client-method
- [payWithPaymentSignature](api/paywithpaymentsignature.html) — client-method
- [createWalletCheckout](api/createwalletcheckout.html) — client-method
- [createCircleGatewayBrowserAdapter](api/createcirclegatewaybrowseradapter.html) — client-method
- [createTransferCheckout](api/createtransfercheckout.html) — client-method
- [payWithTransfer](api/paywithtransfer.html) — client-method
- [createEvmGatewayUnlock](api/createevmgatewayunlock.html) — client-method
- [createHostedUnlock](api/createhostedunlock.html) — client-method
- [rateContentOnchain](api/ratecontentonchain.html) — client-method
- [createOnchainRating](api/createonchainrating.html) — client-method
- [mountRatingUI](api/mountratingui.html) — client-method
- [payAndUnlockResource](api/payandunlockresource.html) — client-method
- [setupResourcePage](api/setupresourcepage.html) — client-method
- [ratingMessage](api/ratingmessage.html) — client-method
- [normalizeResource](api/normalizeresource.html) — client-method
- [validateResourceMetadata](api/validateresourcemetadata.html) — standalone-function
- [normalizeContentType](api/normalizecontenttype.html) — client-method
- [flush](api/flush.html) — client-method
