export function jsonReplacer(_key, value) {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export function stringifyJson(value) {
  return JSON.stringify(value, jsonReplacer);
}
