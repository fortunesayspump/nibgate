import { defineConfig, markdown } from 'sourcey';
export default defineConfig({
 name: 'Nibgate SDK',
 siteUrl: 'https://docs.nibgate.xyz',
 baseUrl: '/sdk-reference',
 navigation: { tabs: [{ tab: 'SDK Reference', slug: '', source: markdown({ groups: [
 { group: 'Overview', pages: ['pages/introduction'] },
 { group: 'Client API', pages: ["pages/api/gate","pages/api/content","pages/api/registerContent","pages/api/view","pages/api/track","pages/api/unlockStarted","pages/api/unlockCompleted","pages/api/paymentCompleted","pages/api/rateResource","pages/api/trackResourcePage","pages/api/checkResourceAccess","pages/api/payWithPaymentSignature","pages/api/createWalletCheckout","pages/api/createCircleGatewayBrowserAdapter","pages/api/createTransferCheckout","pages/api/payWithTransfer","pages/api/createEvmGatewayUnlock","pages/api/createHostedUnlock","pages/api/rateContentOnchain","pages/api/createOnchainRating","pages/api/mountRatingUI","pages/api/payAndUnlockResource","pages/api/setupResourcePage","pages/api/ratingMessage","pages/api/normalizeResource","pages/api/validateResourceMetadata","pages/api/normalizeContentType","pages/api/flush"] }
 ] }) }] },
});
