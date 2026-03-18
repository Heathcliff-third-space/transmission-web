import type { SessionStatsArguments } from '@/api/rpc'
import { rpc } from '@/api/rpc'
import { formatSpeed } from '@/utils'
import { useIntervalFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useStatsStore = defineStore('stats', () => {
  const stats = ref<SessionStatsArguments | null>(null)
  async function fetchStats() {
    const res = await rpc.sessionStats()
    if (res?.arguments) {
      stats.value = res.arguments
      document.title = `Transmission ↓ ${formatSpeed(stats.value.downloadSpeed)} ↑ ${formatSpeed(
        stats.value.uploadSpeed
      )}`
    }
  }
  const { pause: stopPolling, resume: startPolling } = useIntervalFn(fetchStats, 5000, { immediate: false })
  return { stats, fetchStats, startPolling, stopPolling }
})
