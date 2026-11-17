export const scheduledJobs = Object.freeze({
  manifest: 15 * 60_000,
  reputation: 5 * 60_000,
  'gsc-sitemap': 24 * 60 * 60_000,
  'gsc-index': 24 * 60 * 60_000,
});

export function scheduledMonitorEnabled(name, env = process.env) {
  const names = (env.NIBGATE_SCHEDULED_MONITORS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const value of names) {
    if (!Object.hasOwn(scheduledJobs, value)) throw new Error(`Unknown scheduled monitor: ${value}`);
  }
  return names.includes(name);
}
