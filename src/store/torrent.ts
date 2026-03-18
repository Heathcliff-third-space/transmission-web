import type { Torrent } from '@/api/rpc'
import { rpc } from '@/api/rpc'
import { useColumns } from '@/composables/useColumns'
import { useSelection } from '@/composables/useSelection'
import { useSettingStore } from '@/store/setting'
import { isPerfEnabled, startPerfScope } from '@/utils/perf'
import { defineStore } from 'pinia'
import { computed, ref, toRaw, watch } from 'vue'
import {
  buildDownloadDirTree,
  detailFilterOptions,
  mapToOptions,
  matchesTorrentFilters,
  processTorrent,
  sortTorrents,
  statusCountsToMap,
  type IMenuItem,
  type StatusCountMap,
  type TorrentFilterValues
} from './torrentUtils'

const listFields = [
  'activityDate',
  'addedDate',
  'bandwidthPriority',
  'doneDate',
  'downloadDir',
  'downloadedEver',
  'error',
  'errorString',
  'eta',
  'file-count',
  'group',
  'haveValid',
  'id',
  'isPrivate',
  'labels',
  'leftUntilDone',
  'magnetLink',
  'metadataPercentComplete',
  'name',
  'peersGettingFromUs',
  'peersSendingToUs',
  'percentDone',
  'pieceCount',
  'pieceSize',
  'queuePosition',
  'rateDownload',
  'rateUpload',
  'secondsSeeding',
  'sizeWhenDone',
  'status',
  'totalSize',
  'trackerStats',
  'uploadRatio',
  'uploadedEver',
  'trackerList',
  'seedIdleLimit',
  'seedIdleMode',
  'seedRatioLimit',
  'seedRatioMode',
  'sequential_download',
  'honorsSessionLimits',
  'downloadLimited',
  'uploadLimited',
  'downloadLimit',
  'uploadLimit',
  'peer-limit'
]

const detailFields = [
  'hashString',
  'recheckProgress',
  'files',
  'fileStats',
  'peers',
  'peersFrom',
  'creator',
  'comment',
  'dateCreated',
  'maxConnectedPeers'
]

export const useTorrentStore = defineStore('torrent', () => {
  const torrents = ref<Torrent[]>([])
  const settingStore = useSettingStore()
  // 排序相关
  const sortKey = ref<string>('id') // 默认按添加时间排序
  const sortOrder = ref<'asc' | 'desc'>('desc') // 默认降序
  function setSort(key: string) {
    if (sortKey.value === key) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortKey.value = key
      sortOrder.value = 'desc' // 新字段默认降序
    }
  }

  // 搜索关键字
  const search = ref('')

  // 过滤条件（单选）
  const statusFilter = ref<string>('all')
  const labelsFilter = ref<string>('all')
  const trackerFilter = ref<string>('all')
  const errorStringFilter = ref<string>('all')
  const downloadDirFilter = ref<string>('all')

  // 列显示相关逻辑抽离
  const {
    columns,
    setVisibleColumns,
    updateColumnWidth,
    toggleColumnVisible,
    moveColumn,
    visibleColumns,
    tableMinWidth,
    mapColumnWidth,
    getColumnTitle
  } = useColumns()

  const aggregateData = computed(() => {
    const perf = startPerfScope('torrent.aggregateData')
    const rawTorrents = toRaw(torrents.value)
    const ignoredTrackerPrefixesReg = settingStore.ignoredTrackerPrefixesReg
    // 初始化统计集合
    const labelsSet = new Map<string, IMenuItem>()
    labelsSet.set('noLabels', { count: 0, label: '无标签' })
    const trackerSet = new Map<string, IMenuItem>()
    const errorStringSet = new Map<string, IMenuItem>()
    const downloadDirSet = new Map<string, IMenuItem>()
    const statusCounts: StatusCountMap = {
      downloading: 0,
      stopped: 0,
      completed: 0,
      verifying: 0,
      active: 0,
      inactive: 0,
      working: 0,
      error: 0,
      magnet: 0
    }
    const mapTorrentsIndex: Record<number, number> = {}

    perf.section('aggregateOptions', () => {
      rawTorrents.forEach((t, idx) => {
        mapTorrentsIndex[t.id] = idx
        detailFilterOptions(
          t,
          labelsSet,
          trackerSet,
          errorStringSet,
          downloadDirSet,
          statusCounts,
          ignoredTrackerPrefixesReg
        )
      })
    })

    const downloadDirTree = perf.section('buildDownloadDirTree', () => buildDownloadDirTree(rawTorrents))
    const options = perf.section('buildOptions', () => ({
      labelsOptions: mapToOptions(labelsSet, torrents.value.length),
      trackerOptions: mapToOptions(trackerSet, torrents.value.length),
      errorStringOptions: mapToOptions(errorStringSet, torrents.value.length),
      downloadDirOptions: mapToOptions(downloadDirSet, torrents.value.length),
      downloadDirTreeOptions: downloadDirTree.tree,
      downloadDirTotalSize: downloadDirTree.totalSize,
      statusOptions: mapToOptions(statusCountsToMap(statusCounts), torrents.value.length)
    }))
    const result = {
      options,
      mapTorrentsIndex,
      validStatusKeys: new Set(Object.keys(statusCounts)),
      validLabelsKeys: new Set(labelsSet.keys()),
      validTrackerKeys: new Set(trackerSet.keys()),
      validErrorKeys: new Set(errorStringSet.keys()),
      validDownloadDirKeys: downloadDirTree.validKeys
    }
    perf.end()
    return result
  })

  const activeFilters = computed<TorrentFilterValues>(() => ({
    search: search.value,
    statusFilter: statusFilter.value,
    labelsFilter: labelsFilter.value,
    trackerFilter: trackerFilter.value,
    errorStringFilter: errorStringFilter.value,
    downloadDirFilter: downloadDirFilter.value
  }))

  const filteredTorrents = computed(() => {
    const perf = startPerfScope('torrent.filterTorrents', 6)
    const currentFilters = activeFilters.value
    const rawTorrents = toRaw(torrents.value)
    const filtered: Torrent[] = []

    perf.section('walkTorrents', () => {
      for (const torrent of rawTorrents) {
        if (matchesTorrentFilters(torrent, currentFilters)) {
          filtered.push(torrent)
        }
      }
    })

    perf.end()
    return filtered
  })

  const filterTorrents = computed(() => {
    const perf = startPerfScope('torrent.sortFilteredTorrents', 6)
    const sorted = [...filteredTorrents.value]

    if (sortKey.value) {
      perf.section('sortFiltered', () => {
        sortTorrents(sorted, sortKey, sortOrder)
      })
    }

    perf.end()
    return sorted
  })

  const mapFilterTorrentsIndex = computed(() => {
    const indexMap: Record<number, number> = {}
    filterTorrents.value.forEach((torrent, index) => {
      indexMap[torrent.id] = index
    })
    return indexMap
  })

  const options = computed(() => aggregateData.value.options)

  // selection 相关逻辑拆分
  const {
    mapSelectedKeys,
    selectedKeys,
    setSelectedKeys,
    toggleSelectedKey,
    clearSelectedKeys,
    selectRange,
    lastSelectedKey,
    setLastSelectedKey
  } = useSelection(() => filterTorrents.value)

  async function fetchTorrents() {
    const fields = listFields
    const res = await rpc.torrentGet(fields)
    const old = torrents.value
    let newRes = res?.arguments?.torrents || []
    newRes = newRes.map((t) => {
      let item = processTorrent(t)
      const index = aggregateData.value.mapTorrentsIndex[item.id]
      if (index >= 0) {
        item = Object.assign({}, old[index], item)
      }
      return item
    })
    torrents.value = newRes
  }

  async function fetchDetails() {
    const perf = startPerfScope('torrent.fetchDetails', 6)
    if (selectedKeys.value.length === 0) {
      perf.end()
      return
    }
    const id = lastSelectedKey.value
    if (id === null) {
      perf.end()
      return
    }
    const res = await perf.section('rpc.torrentGet(detail)', async () =>
      rpc.torrentGet([...detailFields, ...listFields], [id], {
        params: {
          type: 'detail'
        }
      })
    )
    const index = aggregateData.value.mapTorrentsIndex[id]
    if (index >= 0 && res?.arguments?.torrents?.[0]) {
      perf.section('mergeDetailIntoTorrent', () => {
        Object.assign(torrents.value[index], res?.arguments?.torrents?.[0])
      })
    }
    perf.end()
  }

  const torrentMap = computed(() => {
    const map = new Map<number, Torrent>()
    torrents.value.forEach((torrent) => {
      map.set(torrent.id, torrent)
    })
    return map
  })

  const interval = computed(() => settingStore.setting.polling.torrentInterval * 1000)
  const { pause: stopPolling, resume: startPolling } = useIntervalFn(fetchTorrents, interval, { immediate: false })
  const detailInterval = computed(() => settingStore.setting.polling.torrentDetailInterval * 1000)
  const { pause: stopDetailPolling, resume: startDetailPolling } = useIntervalFn(fetchDetails, detailInterval, {
    immediate: false
  })

  watch(
    aggregateData,
    (data) => {
      if (!data.validStatusKeys.has(statusFilter.value)) {
        statusFilter.value = 'all'
      }
      if (!data.validLabelsKeys.has(labelsFilter.value)) {
        labelsFilter.value = 'all'
      }
      if (!data.validTrackerKeys.has(trackerFilter.value)) {
        trackerFilter.value = 'all'
      }
      if (!data.validErrorKeys.has(errorStringFilter.value)) {
        errorStringFilter.value = 'all'
      }
      if (!data.validDownloadDirKeys.has(downloadDirFilter.value)) {
        downloadDirFilter.value = 'all'
      }
    },
    {
      immediate: true
    }
  )

  watch([search, statusFilter, labelsFilter, trackerFilter, errorStringFilter, downloadDirFilter], (next, prev) => {
    if (isPerfEnabled()) {
      const keys = ['search', 'status', 'labels', 'tracker', 'error', 'directory']
      const changed = keys.reduce<Record<string, { from: string; to: string }>>((acc, key, index) => {
        if (next[index] !== prev[index]) {
          acc[key] = {
            from: String(prev[index]),
            to: String(next[index])
          }
        }
        return acc
      }, {})

      if (Object.keys(changed).length > 0) {
        console.info('[perf] torrent.filters.changed', changed)
      }
    }
    clearSelectedKeys()
  })
  ;(window as any).torrents = torrents
  return {
    getColumnTitle,
    torrents,
    torrentMap,
    filterTorrents,
    mapFilterTorrentsIndex,
    statusFilter,
    labelsFilter,
    trackerFilter,
    errorStringFilter,
    downloadDirFilter,
    search,
    labelsOptions: computed(() => options.value.labelsOptions),
    trackerOptions: computed(() => options.value.trackerOptions),
    errorStringOptions: computed(() => options.value.errorStringOptions),
    downloadDirOptions: computed(() => options.value.downloadDirOptions),
    downloadDirTreeOptions: computed(() => options.value.downloadDirTreeOptions),
    downloadDirTotalSize: computed(() => options.value.downloadDirTotalSize),
    statusOptions: computed(() => options.value.statusOptions),
    fetchTorrents,
    mapSelectedKeys,
    selectedKeys,
    setSelectedKeys,
    toggleSelectedKey,
    clearSelectedKeys,
    selectRange,
    lastSelectedKey,
    setLastSelectedKey,
    startPolling,
    stopPolling,
    columns,
    setVisibleColumns,
    updateColumnWidth,
    toggleColumnVisible,
    moveColumn,
    visibleColumns,
    tableMinWidth,
    sortKey,
    sortOrder,
    setSort,
    mapColumnWidth,
    fetchDetails,
    startDetailPolling,
    stopDetailPolling
  }
})
