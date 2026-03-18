const PERF_STORAGE_KEY = 'tw:perf'
const DEFAULT_THRESHOLD_MS = 8
const IS_DEV = import.meta.env.DEV

type PerfSections = Record<string, number>

interface PerfStat {
  count: number
  total: number
  max: number
  last: number
}

const stats = new Map<string, PerfStat>()

function getPerfStat(name: string) {
  let stat = stats.get(name)
  if (!stat) {
    stat = {
      count: 0,
      total: 0,
      max: 0,
      last: 0
    }
    stats.set(name, stat)
  }
  return stat
}

export function isPerfEnabled() {
  if (!IS_DEV || typeof window === 'undefined') {
    return false
  }
  try {
    return window.localStorage.getItem(PERF_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function formatSections(sections: PerfSections) {
  return Object.entries(sections)
    .map(([label, value]) => `${label}=${value.toFixed(1)}ms`)
    .join(', ')
}

function recordPerf(name: string, duration: number) {
  const stat = getPerfStat(name)
  stat.count += 1
  stat.total += duration
  stat.max = Math.max(stat.max, duration)
  stat.last = duration
}

function ensurePerfHelpers() {
  if (!IS_DEV || typeof window === 'undefined') {
    return
  }

  if (typeof window.__TW_PERF_DUMP__ !== 'function') {
    window.__TW_PERF_DUMP__ = () => {
      const rows = Array.from(stats.entries())
        .map(([name, stat]) => ({
          name,
          count: stat.count,
          avgMs: Number((stat.total / stat.count).toFixed(2)),
          maxMs: Number(stat.max.toFixed(2)),
          lastMs: Number(stat.last.toFixed(2))
        }))
        .sort((a, b) => b.maxMs - a.maxMs)

      console.table(rows)
      return rows
    }
  }

  if (typeof window.__TW_PERF_RESET__ !== 'function') {
    window.__TW_PERF_RESET__ = () => {
      stats.clear()
    }
  }
}

export function startPerfScope(name: string, thresholdMs = DEFAULT_THRESHOLD_MS) {
  const enabled = isPerfEnabled() && typeof performance !== 'undefined'
  if (!enabled) {
    return {
      section<T>(_: string, fn: () => T): T {
        return fn()
      },
      end() {
        return 0
      }
    }
  }

  ensurePerfHelpers()

  const startedAt = performance.now()
  const sections: PerfSections = {}

  return {
    section<T>(label: string, fn: () => T): T {
      const sectionStartedAt = performance.now()
      try {
        return fn()
      } finally {
        sections[label] = (sections[label] || 0) + (performance.now() - sectionStartedAt)
      }
    },
    end() {
      const duration = performance.now() - startedAt
      recordPerf(name, duration)
      if (duration >= thresholdMs) {
        const sectionsText = formatSections(sections)
        console.info(`[perf] ${name}: ${duration.toFixed(1)}ms${sectionsText ? ` | ${sectionsText}` : ''}`)
      }
      return duration
    }
  }
}

declare global {
  interface Window {
    __TW_PERF_DUMP__?: () => Array<{
      name: string
      count: number
      avgMs: number
      maxMs: number
      lastMs: number
    }>
    __TW_PERF_RESET__?: () => void
  }
}
