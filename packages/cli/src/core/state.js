import fs from 'node:fs';
import path from 'node:path';

function defaultState() {
  return {
    payments: [],
    unlocks: []
  };
}

function safeReadState(statePath) {
  if (!fs.existsSync(statePath)) return defaultState();

  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return {
      payments: Array.isArray(raw.payments) ? raw.payments : [],
      unlocks: Array.isArray(raw.unlocks) ? raw.unlocks : []
    };
  } catch {
    return defaultState();
  }
}

export function createStateStore(statePath) {
  const absolutePath = path.resolve(statePath);
  let state = safeReadState(absolutePath);

  function persist() {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  return {
    path: absolutePath,
    listPayments() {
      return [...state.payments];
    },
    listUnlocks() {
      return [...state.unlocks];
    },
    appendPayment(payment) {
      state = {
        ...state,
        payments: [payment, ...state.payments]
      };
      persist();
    },
    upsertUnlock(unlock) {
      state = {
        ...state,
        unlocks: [
          unlock,
          ...state.unlocks.filter((entry) => entry.token !== unlock.token)
        ]
      };
      persist();
    }
  };
}
