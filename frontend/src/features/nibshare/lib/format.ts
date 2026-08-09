export function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function readTime(body: string): string {
  return `${Math.max(1, Math.round(body.trim().split(/\s+/).length / 200))} min read`;
}
