export function serverEnv(name, fallback = '') {
  return globalThis.process?.env?.[name] ?? fallback;
}
