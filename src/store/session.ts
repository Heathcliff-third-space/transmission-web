import type { SessionArguments } from '@/api/rpc'
import { rpc } from '@/api/rpc'
import { sleep } from '@/utils'
import { useSettingStore } from '@/store/setting'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSessionStore = defineStore('session', () => {
  const session = ref<SessionArguments | null>(null)
  const settingStore = useSettingStore()
  // 注意我们这里最低支持 17的rpc 版本
  const rpcVersion = computed(() => session.value?.['rpc-version'] || 17)
  async function fetchSession(retry = true) {
    try {
      const res = await rpc.sessionGet()
      if (res?.arguments) {
        session.value = res.arguments
        document.title = 'Transmission'
        return true
      }
    } catch (e: any) {
      if (retry && e?.response?.status === 409) {
        await sleep(500)
        return await fetchSession(false)
      }
    }
    return false
  }
  const interval = computed(() => settingStore.setting.polling.sessionInterval * 1000)
  const { pause: stopPolling, resume: startPolling } = useIntervalFn(fetchSession, interval, { immediate: false })

  return { session, fetchSession, rpcVersion, startPolling, stopPolling }
})
