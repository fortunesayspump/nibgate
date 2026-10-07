// Episodic lesson store (Reflexion-lite): verbal lessons distilled from
// failed runs, retrieved by task similarity, injected into future runs.
//
// Primary store is the AgentLesson table (survives deploys and restarts).
// File store is the fallback when the DB is unreachable — lessons are
// advisory, so storage failure degrades silently instead of failing runs.
// Bounded at LIMITS.lessonsMax entries either way.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS } from './limits.js';
import { similarity } from './stops.js';
import { db } from '../db.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const FILE = join(DIR, 'agent-lessons.json');

function loadFile() {
  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persistFile(lessons) {
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(lessons.slice(-LIMITS.lessonsMax), null, 1));
  } catch { /* advisory; never fail a run */ }
}

async function loadDb() {
  const rows = await db.agentLesson.findMany({ orderBy: { createdAt: 'desc' }, take: LIMITS.lessonsMax });
  return rows.map((r) => ({ task: r.task, lesson: r.lesson, stopReason: r.stopReason }));
}

export async function loadLessons() {
  try {
    return await loadDb();
  } catch {
    return loadFile();
  }
}

export async function saveLesson({ task, lesson, stopReason }) {
  if (!lesson || !task) return;
  const entry = { task: String(task).slice(0, 300), lesson: String(lesson).slice(0, 200), stopReason };
  try {
    await db.agentLesson.create({ data: entry });
    const excess = await db.agentLesson.count() - LIMITS.lessonsMax;
    if (excess > 0) {
      const oldest = await db.agentLesson.findMany({ orderBy: { createdAt: 'asc' }, take: excess, select: { id: true } });
      if (oldest.length) await db.agentLesson.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } });
    }
  } catch {
    persistFile([...loadFile().filter((l) => l.task !== entry.task), entry]);
  }
}

/** Best lesson for this task: most similar past task above the threshold. */
export async function findLesson(task) {
  const lessons = await loadLessons();
  let best = null;
  let bestSim = 0;
  for (const l of lessons) {
    const sim = similarity(String(task), l.task);
    if (sim > bestSim) {
      bestSim = sim;
      best = l;
    }
  }
  return bestSim >= LIMITS.lessonSimMin ? best : null;
}
