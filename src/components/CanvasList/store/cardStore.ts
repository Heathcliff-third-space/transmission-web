import { useIsSmallScreen } from '@/composables/useIsSmallScreen'
import { useSettingStore, useTorrentStore } from '@/store'
import { startPerfScope } from '@/utils/perf'
import { defineStore } from 'pinia'
import type { MobileRowHeightInfo } from '../MobileCells'
import { calculateMobileRowHeightInfo } from './mobileUtils'
import { useCommonViewport } from './useCommonViewport'
import { useVirtualList } from './useVirtualList'
import { TOOLBAR_HEIGHT } from './utils'

/**
 * 移动端卡片列表 Store
 * 专门处理移动端卡片视图的状态管理
 */
export const useCardStore = defineStore('CanvasCard', () => {
  const torrentStore = useTorrentStore()
  const settingStore = useSettingStore()
  const virtualList = useVirtualList()
  const viewport = useCommonViewport()

  // 移动端特有的缓存
  const cacheRowHeightsMobile = new Map<
    number,
    { heightInfo: MobileRowHeightInfo; labels: string; name: string; clientWidth: number }
  >()
  virtualList.setClientWidth(document.documentElement.clientWidth)

  // 计算移动端卡片累积高度
  const cumulativeHeights = computed(() => {
    const perf = startPerfScope('card.cumulativeHeights', 6)
    const heights: number[] = []
    const mapRowHeights = new Map<number, number>()
    let total = 0

    perf.section('walkFilteredTorrents', () => {
      for (const torrent of torrentStore.filterTorrents) {
        const cacheData = cacheRowHeightsMobile.get(torrent.id)
        // 检查名称、标签和客户端宽度是否变化
        if (
          cacheData &&
          // cacheData.labels === torrent.labels.toString() &&
          cacheData.name === torrent.name &&
          cacheData.clientWidth === virtualList.clientWidth.value
        ) {
          total += cacheData.heightInfo.totalHeight
          heights.push(total)
          mapRowHeights.set(torrent.id, cacheData.heightInfo.totalHeight)
          continue
        }
        // 重新计算移动端高度信息
        const heightInfo = calculateMobileRowHeightInfo(torrent, virtualList.clientWidth.value, settingStore.themeVars)
        mapRowHeights.set(torrent.id, heightInfo.totalHeight)
        cacheRowHeightsMobile.set(torrent.id, {
          heightInfo,
          labels: torrent.labels.toString(),
          name: torrent.name,
          clientWidth: virtualList.clientWidth.value
        })
        total += heightInfo.totalHeight
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
    return Math.max(totalHeight + TOOLBAR_HEIGHT, virtualList.clientHeight.value)
  })

  // 监听滚动条位置和窗口高度变化
  watch(
    [virtualList.scrollTop, virtualList.clientHeight, cumulativeHeights],
    ([newTop, newHeight]) => {
      viewport.updateRowViewport(newTop, newHeight, cumulativeHeights.value.heights)
    },
    { flush: 'post' }
  )

  // 主题变化时，清空移动端行高度缓存
  watch(
    [() => settingStore.themeVars.fontSize, () => settingStore.themeVars.fontFamily],
    () => {
      cacheRowHeightsMobile.clear()
    },
    {
      flush: 'post'
    }
  )

  // 获取移动端行的Cell高度信息
  const getMobileRowCellHeights = (torrentId: number): number[] => {
    const cacheData = cacheRowHeightsMobile.get(torrentId)
    return cacheData?.heightInfo.cellHeights || []
  }

  return {
    // 继承虚拟列表基础功能
    ...virtualList,
    // 继承视口管理功能（只使用行相关的）
    startY: viewport.startY,
    renderStartIdx: viewport.renderStartIdx,
    renderEndIdx: viewport.renderEndIdx,
    visibleStart: viewport.visibleStart,
    visibleEnd: viewport.visibleEnd,

    // 移动端特有功能
    scrollHeight,
    cumulativeHeights,
    getMobileRowCellHeights
  }
})
