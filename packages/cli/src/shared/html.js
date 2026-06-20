export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function money(value) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 6
  });
}
