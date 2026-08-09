export function subdomainFromHost(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return null;
  const parts = h.split(".");
  if (parts.length >= 3 && parts[0] !== "www") return parts[0];
  return null;
}

export function fd(v: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(v));
}

export function rd(body: string) {
  if (!body || !body.trim()) return "";
  return `${Math.max(1, Math.round(body.trim().split(/\s+/).length / 200))} min read`;
}
