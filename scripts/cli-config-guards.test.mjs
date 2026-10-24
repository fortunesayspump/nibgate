import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getRuntimeConfig } from '../packages/cli/src/core/command-context.js';
import { resolveConfigPath } from '../packages/cli/src/core/config.js';

function withConfigEnv(value, run) {
  const previous = process.env.NIBGATE_CONFIG;
  if (value === undefined) delete process.env.NIBGATE_CONFIG;
  else process.env.NIBGATE_CONFIG = value;
  try { return run(); }
  finally {
    if (previous === undefined) delete process.env.NIBGATE_CONFIG;
    else process.env.NIBGATE_CONFIG = previous;
  }
}

test('an explicitly configured missing file fails instead of falling back', () => {
  withConfigEnv(path.join(os.tmpdir(), 'nibgate-definitely-missing.json'), () => {
    assert.throws(() => resolveConfigPath(), /Configured NIBGATE_CONFIG does not exist/);
    assert.throws(() => getRuntimeConfig(), /Configured NIBGATE_CONFIG does not exist/);
  });
});

test('a malformed explicit config fails instead of enabling payment defaults', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nibgate-cli-config-'));
  const configPath = path.join(directory, 'nibgate.config.json');
  try {
    fs.writeFileSync(configPath, '{ malformed json');
    withConfigEnv(configPath, () => {
      assert.throws(() => getRuntimeConfig(), SyntaxError);
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
