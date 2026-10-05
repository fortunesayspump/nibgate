// Episodic lesson store (Reflexion-lite): verbal lessons distilled from
// failed runs, keyed by task text, retrieved by similarity. Bounded at
// LIMITS.lessonsMax entries. File-backed next to the backend (works local
// and dev; Railway ephemeral fs means prod lessons reset on redeploy —
// a DB-backed store is the documented upgrade, not today's build).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS } from './limits.js';
import { similarity } from './stops.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const FILE = join(DIR, 'agent-lessons.json');

export function loadLessons() {
  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persist(lessons) {
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(lessons.slice(-LIMITS.lessonsMax), null, 1));
  } catch { /* lessons are advisory; never fail a run over them */ }
}

export function saveLesson({ task, lesson, stopReason }) {
  if (!lesson || !task) return;
  const lessons = loadLessons().filter((l) => l.task !== String(task).slice(0, 300));
  lessons.push({ task: String(task).slice(0, 300), lesson: String(lesson).slice(0, 200), stopReason, at: new Date().toISOString() });
  persist(lessons);
}

/** Best lesson for this task: most similar past task above the threshold. */
export function findLesson(task) {
  const lessons = loadLessons();
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
