function withDatabasePoolDefaults(value) {
  if (!value) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('DATABASE_URL must be a valid connection URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return value;
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5');
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '10');
  return url.toString();
}

module.exports = { withDatabasePoolDefaults };
