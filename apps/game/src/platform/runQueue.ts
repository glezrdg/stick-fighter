import { type RunReport, RunReportSchema } from '@stick/shared'

import { ApiClient } from './api'

interface QueuedRun {
  queuedAt: number
  report: RunReport
}

/**
 * Offline retry queue for run submissions.
 *
 * If the backend is offline (or `VITE_API_URL` isn't configured) when a run
 * ends, the report is pushed here instead of being lost. The next time the
 * client boots — or the next time a run is submitted successfully — the
 * queue is flushed in FIFO order.
 *
 * Stored as JSON in localStorage under `STORAGE_KEY`. Each entry is wrapped
 * with a `queuedAt` epoch ms so we can drop ancient stragglers (>30 days).
 */

const STORAGE_KEY = 'stickFighter.runQueue.v1'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 50

function readQueue(): QueuedRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    const cutoff = Date.now() - MAX_AGE_MS
    const out: QueuedRun[] = []
    for (const item of data) {
      if (typeof item !== 'object' || item === null) continue
      const queuedAt = (item as { queuedAt?: unknown }).queuedAt
      if (typeof queuedAt !== 'number' || queuedAt < cutoff) continue
      const reportParsed = RunReportSchema.safeParse((item as { report?: unknown }).report)
      if (!reportParsed.success) continue
      out.push({ queuedAt, report: reportParsed.data })
    }
    return out
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedRun[]): void {
  try {
    const trimmed = queue.slice(-MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Quota exceeded or storage disabled — fail silently. The queue is a
    // best-effort feature, not a hard requirement.
  }
}

export const RunQueue = {
  enqueue(report: RunReport): void {
    const queue = readQueue()
    queue.push({ queuedAt: Date.now(), report })
    writeQueue(queue)
  },

  size(): number {
    return readQueue().length
  },

  /** Flush every queued report. Stops on the first failure so the queue is
   *  retried in order on the next call. Returns the number flushed. */
  async flush(): Promise<number> {
    if (!ApiClient.isConfigured()) return 0
    const queue = readQueue()
    if (queue.length === 0) return 0
    let flushed = 0
    while (queue.length > 0) {
      const head = queue[0]
      if (!head) break
      const result = await ApiClient.submitRun(head.report)
      if (result === null) break
      queue.shift()
      flushed += 1
    }
    writeQueue(queue)
    return flushed
  },
} as const
