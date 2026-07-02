export function apiBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://api.nibgate.xyz' : 'http://localhost:3000');
  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

export function apiUrl(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl()}${cleanPath}`;
}
