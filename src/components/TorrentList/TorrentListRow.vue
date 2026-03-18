<template>
  <DynamicScrollerItem
    :item="row"
    :size-dependencies="[row.labels, row.name]"
    :active="active"
    :data-torrent-id="row.id"
    class="torrent-row"
    :class="{ selected }"
  >
    <div class="torrent-row-cell torrent-row-cell-checkbox" :key="row.id" v-if="isSmallLg">
      <n-checkbox :checked="!!torrentStore.mapSelectedKeys[row.id]" @update:checked="onCheckboxChange" />
    </div>
    <template v-for="col in visibleColumns" :key="col.key">
      <component
        class="torrent-row-cell"
        :style="{ width: col.width + 'px' }"
        :is="cellComponentMap[col.key] || DefaultCell"
        :row="row"
        :col="col"
        :value="(row as any)[col.key]"
      />
    </template>
  </DynamicScrollerItem>
</template>
<script setup lang="ts">
import type { Torrent } from '@/api/rpc'
import { useIsSmallLg } from '@/composables/useIsSmallScreen'
import { useTorrentStore } from '@/store'
import { type Component } from 'vue'
import { DynamicScrollerItem } from 'vue-virtual-scroller'
import ByteRateCell from './cells/ByteRateCell.vue'
import ByteSizeCell from './cells/ByteSizeCell.vue'
import DateCell from './cells/DateCell.vue'
import DefaultCell from './cells/DefaultCell.vue'
import UploadRatioCell from './cells/FixedDecimal.vue'
import IsPrivateCell from './cells/IsPrivateCell.vue'
import LabelsCell from './cells/LabelsCell.vue'
import NameCell from './cells/NameCell.vue'
import PeersCell from './cells/PeersCell.vue'
import PercentBarCell from './cells/PercentBarCell.vue'
import PositiveNumberCell from './cells/PositiveNumber.vue'
import PriorityCell from './cells/PriorityCell.vue'
import SeedsCell from './cells/SeedsCell.vue'
import StatusCell from './cells/StatusCell.vue'
import TimeCell from './cells/TimeCell.vue'
import UpDownRatioCell from './cells/UpDownRatioCell.vue'

const props = defineProps<{
  row: Torrent
  selected: boolean
  active: boolean
  index?: number
  cellHeight: number
}>()

const torrentStore = useTorrentStore()
const visibleColumns = computed(() => torrentStore.visibleColumns)
const isSmallLg = useIsSmallLg()

function onCheckboxChange(checked: boolean) {
  if (checked) {
    torrentStore.setSelectedKeys(Array.from(new Set([...torrentStore.selectedKeys, props.row.id])))
  } else {
    torrentStore.setSelectedKeys(torrentStore.selectedKeys.filter((id) => id !== props.row.id))
  }
}

const cellComponentMap: Record<string, Component> = {
  name: NameCell,
  labels: LabelsCell,
  // 总大小
  totalSize: ByteSizeCell,
  // 选定大小
  sizeWhenDone: ByteSizeCell,
  // 剩余
  leftUntilDone: ByteSizeCell,
  //有效
  haveValid: ByteSizeCell,
  // 已下载
  downloadedEver: ByteSizeCell,
  // 已上传
  uploadedEver: ByteSizeCell,
  // 上传下载比
  uploadedDownloaded: UpDownRatioCell,
  // 分享率
  uploadRatio: UploadRatioCell,
  // 进度
  percentDone: PercentBarCell,
  // 下载速度
  rateDownload: ByteRateCell,
  // 上传速度
  rateUpload: ByteRateCell,
  // 状态
  status: StatusCell,
  // 添加时间
  addedDate: DateCell,
  // 种子|活跃
  peersSendingToUs: SeedsCell,
  // 下载|活跃
  peersGettingFromUs: PeersCell,
  // 剩余时间
  eta: TimeCell,
  // 完成时间
  doneDate: DateCell,
  // 最后活动时间
  activityDate: DateCell,
  bandwidthPriority: PriorityCell,
  queuePosition: PositiveNumberCell,
  // 做种时长
  secondsSeeding: TimeCell,
  // 文件数
  'file-count': PositiveNumberCell,
  // 块数
  pieceCount: PositiveNumberCell,
  // 元数据完成度
  metadataPercentComplete: PercentBarCell,
  isPrivate: IsPrivateCell
}
</script>
<style lang="less" scoped>
.torrent-row {
  display: flex;
  align-items: center;
  cursor: pointer;
  min-height: 32px;
  box-sizing: border-box;
  color: var(--text-color-1);
  background-color: var(--table-color);
  user-select: none;
  -webkit-touch-callout: none; /* iOS Safari */
  -webkit-user-select: none; /* Safari */
  border-top: 0px;
  outline: 1px solid var(--border-color);
  &:hover {
    background-color: var(--table-color-hover);
  }
  &.selected {
    background-color: color-mix(in srgb, var(--primary-color) 14%, var(--table-color));
  }

  &:nth-child(even) {
    background-color: var(--table-color);
    &.selected {
      background-color: color-mix(in srgb, var(--primary-color) 14%, var(--table-color));
    }
  }
}

.torrent-row-cell {
  padding-inline: 4px;
  padding-inline-end: 6px;
  padding-block: 4px;
  box-sizing: border-box;
  flex-shrink: 0;
  flex-grow: 0;
}
</style>
