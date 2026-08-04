const providers = {};

export function registerProvider(name, factory, config) {
  providers[name] = { factory, config };
}

function resolveStore(name) {
  const entry = providers[name];
  if (!entry) throw new Error(`storage provider "${name}" is not registered. Call registerProvider() first.`);
  return entry.factory(entry.config);
}

export async function putBlob({ provider = 'nibgate', key, data, contentType = 'application/octet-stream', cacheControl }) {
  const store = resolveStore(provider);
  return store.put({ key, data, contentType, cacheControl });
}

export async function getBlob({ provider = 'nibgate', storageRef }) {
  const store = resolveStore(provider);
  return store.get({ storageRef });
}

export async function deleteBlob({ provider = 'nibgate', storageRef }) {
  const store = resolveStore(provider);
  return store.delete({ storageRef });
}
