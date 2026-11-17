// Close the pool only after all queries AND whole transactions are idle.
// A new operation arriving during disconnect waits for it, then Prisma reconnects.
export function createIdleDatabaseController({ disconnect, idleMs }) {
  let active = 0;
  let timer;
  let closing = Promise.resolve();
  const arm = () => {
    clearTimeout(timer);
    if (active) return;
    timer = setTimeout(() => {
      closing = Promise.resolve().then(disconnect).catch(() => {});
    }, idleMs);
    timer.unref?.();
  };
  return async function operation(run) {
    clearTimeout(timer);
    active += 1;
    try { await closing; return await run(); }
    finally { active -= 1; arm(); }
  };
}

export function installIdleDatabaseDisconnect(client, idleMs) {
  if (!Number.isInteger(idleMs) || idleMs < 1000) throw new Error('Invalid DB idle timeout');
  const operation = createIdleDatabaseController({ disconnect: () => client.$disconnect(), idleMs });
  client.$use((params, next) => operation(() => next(params)));
  const transaction = client.$transaction.bind(client);
  client.$transaction = (...args) => operation(() => transaction(...args));
}
