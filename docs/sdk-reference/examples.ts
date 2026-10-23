// Generated documentation examples. Payment/provider callbacks are supplied by the integrating app.
import { createNibgate, validateResourceMetadata } from '../../packages/nibgate/src/index.js';
import type { NibgateCheckoutHandler, NibgateEvmTypedDataSigner, NibgateEvmGatewayProvider } from '../../packages/nibgate/src/index.js';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };
declare const verifiedPaymentSignature: string;
declare const walletCheckout: NibgateCheckoutHandler;
declare const signer: NibgateEvmTypedDataSigner;
declare const provider: NibgateEvmGatewayProvider;
declare const sendTransfer: (input: unknown) => Promise<{ txHash: string }>;
declare const signOwnership: (input: unknown) => Promise<string>;

async function example_gate() {
const gate = client.gate(resource);
console.log(gate.resource.id);
}

async function example_content() {
client.content(resource, { source: "sdk-reference" });
}

async function example_registerContent() {
client.registerContent(resource);
}

async function example_view() {
client.view(resource, { source: "article-page" });
}

async function example_track() {
client.track("preview_opened", { resourceId: resource.id });
}

async function example_unlockStarted() {
client.unlockStarted(resource);
}

async function example_unlockCompleted() {
client.unlockCompleted(resource, { paymentId: "verified-receipt-id" });
}

async function example_paymentCompleted() {
client.paymentCompleted(resource, { paymentId: "verified-receipt-id", currency: "USDC" });
}

async function example_rateResource() {
const sent = client.rateResource(resource, 4);
}

async function example_trackResourcePage() {
const page = client.trackResourcePage(resource, { source: "article-page" });
}

async function example_checkResourceAccess() {
const result = await client.checkResourceAccess(resource, { accessPath: "/api/nibgate/access?id=article-1" });
if (result.ok) console.log(result.payload);
}

async function example_payWithPaymentSignature() {
const result = await client.payWithPaymentSignature(resource, { paymentSignature: verifiedPaymentSignature, accessPath: "/api/nibgate/access?id=article-1" });
}

async function example_createWalletCheckout() {
const checkout = client.createWalletCheckout(resource, { checkout: walletCheckout, button: "#unlock" });
checkout.mount();
}

async function example_createCircleGatewayBrowserAdapter() {
const adapter = await client.createCircleGatewayBrowserAdapter({ signer });
}

async function example_createTransferCheckout() {
const checkout = client.createTransferCheckout(resource, { sendTransfer });
}

async function example_payWithTransfer() {
const result = await client.payWithTransfer(resource, { sendTransfer, signOwnership, accessPath: "/api/nibgate/access?id=article-1" });
}

async function example_createEvmGatewayUnlock() {
const controller = client.createEvmGatewayUnlock(resource, { network: "eip155:5042002", provider, autoMount: false });
controller.mount();
// On component cleanup:
controller.destroy();
}

async function example_createHostedUnlock() {
const controller = client.createHostedUnlock(resource, { network: "eip155:5042002", provider, autoMount: false });
controller.destroy();
}

async function example_rateContentOnchain() {
const submitted = await client.rateContentOnchain(resource, { provider, rating: 4, unlockRef: "verified-receipt-id" });
}

async function example_createOnchainRating() {
const rating = client.createOnchainRating(resource, { provider, autoMount: false, payment: { paymentId: "verified-receipt-id" } });
rating.setVisible(true);
}

async function example_mountRatingUI() {
const ui = client.mountRatingUI(resource, { target: "#rating", label: "Rate this article" });
ui?.setRating(4);
// Do not use this version's broken click handler in production.
}

async function example_payAndUnlockResource() {
const result = await client.payAndUnlockResource(resource, { payPath: "/api/nibgate/pay" });
if (result.ok) console.log(result.payment);
}

async function example_setupResourcePage() {
const page = client.setupResourcePage(resource, { button: "#unlock", status: "#status", accessPath: "/api/nibgate/access?id=article-1" });
}

async function example_ratingMessage() {
const message = client.ratingMessage(resource, 4);
}

async function example_normalizeResource() {
const normalized = client.normalizeResource({ id: "article-1", type: "doc", price: "1" });
}

async function example_validateResourceMetadata() {
const validation = validateResourceMetadata(resource);
console.log(validation.errors, validation.warnings);
}

async function example_normalizeContentType() {
const type = client.normalizeContentType("pdf");
}

async function example_flush() {
const drained = client.flush();
}
