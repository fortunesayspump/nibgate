const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'admin', 'app', 'blog', 'dev', 'staging', 'test', 'testnet',
  'mail', 'smtp', 'pop', 'imap', 'webmail', 'email',
  'help', 'support', 'docs', 'status', 'forum',
  'auth', 'login', 'signin', 'register', 'signup',
  'dashboard', 'hub', 'explore', 'discover',
  'cdn', 'static', 'assets', 'media', 'files',
  'root', 'home', 'index', 'main',
  'console', 'manage', 'management', 'operator',
  'pay', 'payment', 'payments', 'checkout',
  'webhook', 'webhooks', 'hook', 'hooks',
  'ssl', 'dns', 'ns1', 'ns2', 'mx',
]);

// `testnet-<name>` aliases are minted by the system (setup route) for every
// site — creators cannot claim them directly, or an alias could shadow or
// impersonate another site's testnet host.
const TESTNET_ALIAS_PREFIX = 'testnet-';

function isValidSubdomain(subdomain) {
  if (!subdomain || typeof subdomain !== 'string') return false;
  const clean = subdomain.trim().toLowerCase();
  if (RESERVED_SUBDOMAINS.has(clean)) return false;
  if (clean.startsWith(TESTNET_ALIAS_PREFIX)) return false;
  return SUBDOMAIN_REGEX.test(clean);
}

module.exports = { isValidSubdomain, RESERVED_SUBDOMAINS, TESTNET_ALIAS_PREFIX };
