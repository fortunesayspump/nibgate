import { defineConfig, markdown } from 'sourcey';
export default defineConfig({
 name: 'Nibgate SDK',
 siteUrl: 'https://docs.nibgate.xyz',
 baseUrl: '/sdk-reference',
 theme: {
   name: 'default',
   appearance: { default: 'light' },
   colors: { primary: '#7c9a6d', light: '#9ab68c', dark: '#607954' },
   fonts: { sans: '"Kumbh Sans", "ABC Favorit", Arial, sans-serif', mono: 'system', google: false },
   layout: { sidebar: '17.5rem', toc: '17rem', content: '53.75rem' },
   css: ['./brand.css'],
 },
 navbar: { links: [
   { type: 'github', label: 'GitHub', href: 'https://github.com/fortunesayspump/nibgate' },
 ] },
 footer: {
   text: 'Nibgate docs. Built for creator-owned paid routes.',
   links: [
     { type: 'link', label: 'Main site', href: 'https://nibgate.xyz' },
     { type: 'link', label: 'Explore', href: 'https://nibgate.xyz/explore' },
     { type: 'link', label: 'Get started', href: 'https://nibgate.xyz/get-started' },
   ],
 },
 navigation: { tabs: [{ tab: 'SDK Reference', slug: '', source: markdown({ groups: [
 { group: 'Overview', pages: ['pages/introduction'] },
 { group: 'Client API', pages: ["pages/api/gate","pages/api/content","pages/api/registerContent","pages/api/view","pages/api/track","pages/api/unlockStarted","pages/api/unlockCompleted","pages/api/paymentCompleted","pages/api/rateResource","pages/api/trackResourcePage","pages/api/checkResourceAccess","pages/api/payWithPaymentSignature","pages/api/createWalletCheckout","pages/api/createCircleGatewayBrowserAdapter","pages/api/createTransferCheckout","pages/api/payWithTransfer","pages/api/createEvmGatewayUnlock","pages/api/createHostedUnlock","pages/api/rateContentOnchain","pages/api/createOnchainRating","pages/api/mountRatingUI","pages/api/payAndUnlockResource","pages/api/setupResourcePage","pages/api/ratingMessage","pages/api/normalizeResource","pages/api/validateResourceMetadata","pages/api/normalizeContentType","pages/api/flush"] }
 ] }) }] },
});
