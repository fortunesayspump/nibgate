import { readFileSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';

const MIB = 1024 * 1024;
const STATUS_FIELDS = { RssAnon: 'anonymousMiB', RssFile: 'fileMiB', RssShmem: 'sharedMiB', VmData: 'dataMiB' };
const RESOURCE_TYPES = new Set(['TCPSocketWrap', 'TCPServerWrap', 'Timeout', 'PipeWrap', 'FSReqCallback', 'TTYWrap']);

// Only numeric memory/thread counters leave /proc. Never emit process names,
// environment, command lines, memory contents or arbitrary status fields.
export function parseLinuxMemoryStatus(status) {
  const counters = {};
  for (const line of status.split('\n')) {
    const match = /^(RssAnon|RssFile|RssShmem|VmData):\s+(\d+)\s+kB$/.exec(line);
    if (match) counters[STATUS_FIELDS[match[1]]] = Math.round(Number(match[2]) / 1024);
    const threads = /^Threads:\s+(\d+)$/.exec(line);
    if (threads) counters.threads = Number(threads[1]);
  }
  return counters;
}

export function memorySample() {
  const usage = process.memoryUsage();
  const heap = getHeapStatistics();
  const resources = {};
  for (const type of process.getActiveResourcesInfo()) {
    const key = RESOURCE_TYPES.has(type) ? type : 'Other';
    resources[key] = (resources[key] || 0) + 1;
  }
  let linux;
  if (process.platform === 'linux') {
    try { linux = parseLinuxMemoryStatus(readFileSync('/proc/self/status', 'utf8')); } catch {}
  }
  return {
    uptimeSec: Math.round(process.uptime()),
    rssMiB: Math.round(usage.rss / MIB),
    heapUsedMiB: Math.round(usage.heapUsed / MIB),
    heapTotalMiB: Math.round(usage.heapTotal / MIB),
    externalMiB: Math.round(usage.external / MIB),
    arrayBuffersMiB: Math.round(usage.arrayBuffers / MIB),
    v8PhysicalMiB: Math.round(heap.total_physical_size / MIB),
    v8MallocedMiB: Math.round(heap.malloced_memory / MIB),
    nativeContexts: heap.number_of_native_contexts,
    detachedContexts: heap.number_of_detached_contexts,
    resources,
    linux,
  };
}
