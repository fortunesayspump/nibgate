export function browserWindow() {
  return typeof window === 'undefined' ? null : window;
}
