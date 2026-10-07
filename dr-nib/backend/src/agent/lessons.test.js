import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../db.js';
import { saveLesson, findLesson } from './lessons.js';

beforeEach(async () => {
  await db.agentLesson.deleteMany({});
});

describe('episodic lessons', () => {
  it('round-trips a lesson through the database', async () => {
    await saveLesson({ task: 'measure base fee gwei on testnet', lesson: 'fetch number and timestamp only', stopReason: 'no-novelty' });
    const found = await findLesson('measure base fee gwei on testnet right now');
    expect(found?.lesson).toBe('fetch number and timestamp only');
  });

  it('returns null for unrelated tasks', async () => {
    await saveLesson({ task: 'measure base fee gwei on testnet', lesson: 'fetch number and timestamp only', stopReason: 'x' });
    expect(await findLesson('write a poem about the sea')).toBeNull();
  });

  it('ignores empty saves', async () => {
    await saveLesson({ task: '', lesson: '' });
    expect(await db.agentLesson.count()).toBe(0);
  });
});
