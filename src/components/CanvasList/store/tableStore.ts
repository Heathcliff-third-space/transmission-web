import type { Torrent } from '@/api/rpc'
import { useSettingStore, useTorrentStore } from '@/store'
import { startPerfScope } from '@/utils/perf'
import { defineStore } from 'pinia'
import { fitText } from '../cells/utils'
import { calculateRowHeight, HEADER_HEIGHT, ICON_GAP, ICON_SIZE, ITEM_HEIGHT, PADDING_X, TOOLBAR_HEIGHT } from './utils'
import { useCommonViewport } from './useCommonViewport'
import { useVirtualList } from './useVirtualList'
import { useIsSmallScreen } from '@/composables/useIsSmallScreen'

/**
 * 桌面端表格列表 Store
 * 专门处理桌面端表格视图的状态管理
 */
export const useTableStore = defineStore('CanvasTable', () => {
  const torrentStore = useTorrentStore()
  const settingStore = useSettingStore()
  const virtualList = useVirtualList()
  const viewport = useCommonViewport()
  const isMobile = useIsSmallScreen()
  const viewTop = computed(() => (isMobile.value ? HEADER_HEIGHT + TOOLBAR_HEIGHT : HEADER_HEIGHT))
  // 桌面端特有的缓存
  const cacheRowHeights = new Map<number, { height: number; labels: string }>()

  // 计算桌面端表格累积高度
  const cumulativeHeights = computed(() => {
    const perf = startPerfScope('table.cumulativeHeights', 6)
    const heights: number[] = []
    const mapRowHeights = new Map<number, number>()
    const mapColumnWidth = torrentStore.mapColumnWidth
    let total = 0

    perf.section('walkFilteredTorrents', () => {
      for (const torrent of torrentStore.filterTorrents) {
        const cacheData = cacheRowHeights.get(torrent.id)
        if (cacheData && cacheData.labels === torrent.labels.toString()) {
          total += cacheData.height
          heights.push(total)
          mapRowHeights.set(torrent.id, cacheData.height)
          continue
        }
        const height = calculateRowHeight(
          torrent,
          mapColumnWidth['labels'],
          settingStore.setting.singleLine,
          settingStore.themeVars
        )
        mapRowHeights.set(torrent.id, height)
        cacheRowHeights.set(torrent.id, { height, labels: torrent.labels.toString() })
        total += height
        heights.push(total)
      }
    })

    const result = {
      heights,
      mapRowHeights
    }
    perf.end()
    return result
  })

  // 计算滚动高度
  const scrollHeight = computed(() => {
    const heights = cumulativeHeights.value.heights
    const totalHeight = heights.length > 0 ? heights[heights.length - 1] : 0
    return Math.max(totalHeight + viewTop.value, virtualList.clientHeight.value)
  })

  // 渲染高度计算
  const renderHeight = computed(() => {
    return (viewport.visibleRowCount.value + virtualList.bufferSize * 2) * ITEM_HEIGHT
  })

  // 监听滚动条位置和窗口高度变化
  watch(
    [virtualList.scrollTop, virtualList.clientHeight, cumulativeHeights],
    ([newTop, newHeight]) => {
      viewport.updateRowViewport(newTop, newHeight, cumulativeHeights.value.heights)
    },
    { flush: 'post' }
  )

  // 监听左侧滚动条位置和列宽度
  watch(
    [virtualList.scrollLeft, virtualList.clientWidth],
    ([newLeft, newWidth]) => {
      viewport.updateColumnViewport(newLeft, newWidth)
    },
    { flush: 'post' }
  )

  // 文本溢出处理
  const canvas = document.createElement('canvas')
  const ellipsisTxtMap = ref<
    Map<number, Record<string, { fitTxt: string | string[]; text: string; width: number; height: number }>>
  >(new Map())

  // 分离文本计算逻辑，减少不必要的重计算
  const textComputeTriggers = computed(() => ({
    renderStart: viewport.renderStartIdx.value,
    renderEnd: viewport.renderEndIdx.value,
    mapColumnWidth: torrentStore.mapColumnWidth,
    filterTorrents: torrentStore.filterTorrents,
    mapRowHeights: cumulativeHeights.value.mapRowHeights,
    lableVisible: !!torrentStore.visibleColumns.find((col) => col.key === 'labels')?.visible
  }))

  watch(
    textComputeTriggers,
    () => {
      const perf = startPerfScope('table.textEllipsis', 6)
      const ctx = canvas.getContext('2d')!
      const theme = settingStore.themeVars
      ctx.reset()
      ctx.font = `${theme.fontSize} ${theme.fontFamily}`
      const labelVisible = textComputeTriggers.value.lableVisible

      // TODO: 这个虽然每次都是用renderStartIdx到renderEndIdx计算一段，但是不停的 set，可能会导致数据变大很多，考虑只保存当前预渲染的所有行的数据
      const map = toRaw(unref(ellipsisTxtMap))
      const keys = [
        'name',
        labelVisible ? 'labels' : '',
        'downloadDir',
        'cachedMainTracker',
        'cachedTrackerStatus'
      ].filter(Boolean) as (keyof Torrent)[]
      const mapRowHeights = cumulativeHeights.value.mapRowHeights

      perf.section('fitVisibleText', () => {
        for (let i = viewport.renderStartIdx.value; i <= viewport.renderEndIdx.value; i++) {
          const row = torrentStore.filterTorrents[i]
          if (!row) {
            break
          }
          keys.forEach((key) => {
            const data = row[key as keyof Torrent]?.toString()
            if (typeof data === 'string' && data.length > 0) {
              const columnWidth = torrentStore.mapColumnWidth[key]
              if (!columnWidth) {
                return
              }
              // 检查是否已有缓存
              const existingData = map.get(row.id)
              let maxWidth = columnWidth - PADDING_X * 2
              const maxHeight = mapRowHeights.get(row.id) || ITEM_HEIGHT
              if (key === 'name') {
                maxWidth -= ICON_SIZE + ICON_GAP
              }
              const cacheData = existingData?.[key]
              // 检查是否需要重新计算
              if (
                !cacheData ||
                cacheData.text !== data ||
                cacheData.width !== columnWidth ||
                cacheData.height !== maxHeight
              ) {
                const fitTxt = fitText(ctx, data, maxWidth, maxHeight, true)
                map.set(row.id, {
                  ...existingData,
                  [key]: {
                    fitTxt,
                    text: data,
                    width: columnWidth,
                    height: maxHeight
                  }
                })
              }
            }
          })
        }
      })
      ellipsisTxtMap.value = map
      perf.end()
    },
    { flush: 'post' }
  )

  // 主题变化时，清空桌面端行高度缓存，清空文字溢出缓存
  watch(
    [
      () => settingStore.themeVars.fontSize,
      () => settingStore.themeVars.fontFamily,
      () => torrentStore.mapColumnWidth,
      () => torrentStore.visibleColumns.find((col) => col.key === 'labels')?.visible,
      () => settingStore.setting.singleLine
    ],
    () => {
      ellipsisTxtMap.value = new Map()
      cacheRowHeights.clear()
    },
    {
      flush: 'pre'
    }
  )

  return {
    // 继承虚拟列表基础功能
    ...virtualList,
    // 继承视口管理功能
    startY: viewport.startY,
    startX: viewport.startX,
    renderStartIdx: viewport.renderStartIdx,
    renderEndIdx: viewport.renderEndIdx,
    visibleStart: viewport.visibleStart,
    visibleStartCol: viewport.visibleStartCol,
    visibleEndCol: viewport.visibleEndCol,
    visibleEnd: viewport.visibleEnd,

    // 桌面端特有功能
    scrollHeight,
    renderHeight,
    cumulativeHeights,
    ellipsisTxtMap,
    viewTop
  }
})
