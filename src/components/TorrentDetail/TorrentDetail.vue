<template>
  <div class="torrent-detail" :style="rootStyle">
    <div class="overlay flex items-center justify-center" v-if="props.loading">
      <n-spin :show="true" />
    </div>
    <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--n-header-border-bottom)]">
      <div class="text-sm">
        <template v-if="selectedCount === 1 && torrent">
          {{ torrent.name }}
        </template>
        <template v-else-if="selectedCount > 1">{{
          $t('torrentDetail.selectedItems', { count: selectedCount })
        }}</template>
        <template v-else>{{ $t('torrentDetail.noSelection') }}</template>
      </div>
      <div class="flex items-center gap-2 pr-1">
        <IconButton v-if="closable" :icon="CloseIcon" @click="onClose" />
      </div>
    </div>
    <n-tabs v-model:value="currentTab" type="line" :animated="true" class="detail-tabs">
      <n-tab-pane name="general" :tab="$t('torrentDetail.general.general')" class="tab-pane">
        <GeneralTab v-if="torrent" :torrent="torrent" />
      </n-tab-pane>
      <n-tab-pane name="files" :tab="$t('torrentDetail.files.files')" class="tab-pane">
        <FilesTab v-if="torrent" :torrent="torrent" />
      </n-tab-pane>
      <n-tab-pane name="peers" :tab="$t('torrentDetail.peers.peers')" class="tab-pane">
        <PeersTab v-if="torrent" :torrent="torrent" />
      </n-tab-pane>
      <n-tab-pane name="tracker" :tab="$t('torrentDetail.tracker.tracker')" class="tab-pane">
        <TrackerTab v-if="torrent" :torrent="torrent" />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import type { Torrent } from '@/api/rpc'
import { useTorrentStore } from '@/store'
import { startPerfScope } from '@/utils/perf'
import { CloseCircleOutline as CloseIcon } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'

interface Props {
  // 用于 PC 场景的固定高度（px），移动端抽屉中可忽略
  height?: number
  // 是否显示右上角关闭按钮（移动端抽屉中使用）
  closable?: boolean
  // 是否显示加载中
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  height: undefined,
  closable: false,
  loading: true
})

const emit = defineEmits<{
  close: []
}>()

const { t: $t } = useI18n()
const torrentStore = useTorrentStore()
const selectedCount = computed(() => torrentStore.selectedKeys.length)
const torrent = computed<Torrent | undefined>(() => {
  const perf = startPerfScope('detail.selectedTorrentLookup', 4)
  if (torrentStore.lastSelectedKey === null) {
    perf.end()
    return undefined
  }
  const id = torrentStore.lastSelectedKey
  const selectedTorrent = torrentStore.torrentMap.get(id)
  perf.end()
  return selectedTorrent
})

const currentTab = ref<'general' | 'files' | 'peers' | 'tracker'>('general')

const rootStyle = computed(() => {
  return props.height ? { height: `${props.height}px` } : {}
})

function onClose() {
  emit('close')
}
</script>

<style lang="less" scoped>
@import '@/styles/mix.less';
.torrent-detail {
  box-sizing: border-box;
  background-color: var(--card-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
  height: 100%;
  .detail-tabs {
    flex: 1;
    overflow: hidden;
    box-sizing: border-box;
  }
  :deep(.n-tabs-nav) {
    padding-inline: 12px;
  }

  :deep(.n-tabs-pane-wrapper) {
    height: 100%;
  }

  :deep(.tab-pane) {
    .scrollbar();
    overflow: auto;
    width: 100%;
    box-sizing: border-box;
    height: 100%;
  }
}
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  backdrop-filter: blur(10px);
  z-index: 22;
}
</style>
