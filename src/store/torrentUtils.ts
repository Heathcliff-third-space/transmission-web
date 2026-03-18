import type { Torrent, TrackerStat } from '@/api/rpc'
import { statusFilterFunMap, statusFilters } from '@/const/status'
import { Status } from '@/types/tr'
import { ShuffleOutline } from '@vicons/ionicons5'
import i18n from '@/i18n'
import { isFunction } from 'lodash-es'

export interface IMenuItem {
  icon?: Component
  count: number
  color?: string
  label?: string
}

export type StatusCountMap = Record<string, number>

export interface DownloadDirTreeOption {
  key: string
  label: string
  count: number
  size: number
  children?: DownloadDirTreeOption[]
  [key: string]: unknown
}

interface DownloadDirTreeNode extends DownloadDirTreeOption {
  childrenMap: Map<string, DownloadDirTreeNode>
}

export function normalizeDownloadDirPath(path: string): string {
  const normalized = (path || '').replace(/\\/g, '/')
  if (!normalized || normalized === '/') {
    return normalized || '/'
  }
  return normalized.replace(/\/+$/, '')
}

function getDownloadDirSegments(path: string) {
  const normalized = normalizeDownloadDirPath(path)
  if (!normalized) {
    return []
  }
  if (normalized === '/') {
    return [{ key: '/', label: '/' }]
  }

  const isUncPath = normalized.startsWith('//')
  const isAbsolutePath = !isUncPath && normalized.startsWith('/')
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length === 0) {
    return []
  }

  const segments: Array<{ key: string; label: string }> = []
  let currentPath = isUncPath ? `//${parts[0]}` : isAbsolutePath ? `/${parts[0]}` : parts[0]

  segments.push({
    key: currentPath,
    label: isUncPath ? `//${parts[0]}` : isAbsolutePath ? `/${parts[0]}` : parts[0]
  })

  for (let index = 1; index < parts.length; index++) {
    currentPath = `${currentPath}/${parts[index]}`
    segments.push({
      key: currentPath,
      label: parts[index]
    })
  }

  return segments
}

function sortDownloadDirTree(nodes: DownloadDirTreeNode[]): DownloadDirTreeOption[] {
  return nodes
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(({ childrenMap, ...node }) => ({
      ...node,
      children: childrenMap.size > 0 ? sortDownloadDirTree(Array.from(childrenMap.values())) : undefined
    }))
}

export function buildDownloadDirTree(torrents: Torrent[]) {
  const rootMap = new Map<string, DownloadDirTreeNode>()
  const validKeys = new Set<string>(['all'])
  let totalSize = 0

  torrents.forEach((torrent) => {
    if (!torrent.downloadDir) {
      return
    }

    const dirSize = torrent.sizeWhenDone || 0
    totalSize += dirSize

    let currentMap = rootMap
    getDownloadDirSegments(torrent.downloadDir).forEach((segment) => {
      validKeys.add(segment.key)

      let node = currentMap.get(segment.key)
      if (!node) {
        node = {
          key: segment.key,
          label: segment.label,
          count: 0,
          size: 0,
          children: undefined,
          childrenMap: new Map<string, DownloadDirTreeNode>()
        }
        currentMap.set(segment.key, node)
      }

      node.count += 1
      node.size += dirSize
      currentMap = node.childrenMap
    })
  })

  return {
    tree: sortDownloadDirTree(Array.from(rootMap.values())),
    validKeys,
    totalSize
  }
}

export function getNormalizedTrackerHost(host: string, ignoredTrackerPrefixesReg: RegExp) {
  let normalizedHost = host || ''
  const portMatch = portRe.exec(normalizedHost)
  if (portMatch != null) {
    normalizedHost = normalizedHost.substring(0, portMatch.index)
  }
  const prefixMatch = ignoredTrackerPrefixesReg.exec(normalizedHost)
  const matchedPrefix = prefixMatch?.groups?.prefix || prefixMatch?.[1]
  if (matchedPrefix) {
    normalizedHost = normalizedHost.substring(matchedPrefix.length + 1)
  }
  return normalizedHost
}

// 将所有的选项放到 map
export const detailFilterOptions = function (
  t: Torrent,
  labelsSet: Map<string, IMenuItem>,
  trackerSet: Map<string, IMenuItem>,
  errorStringSet: Map<string, IMenuItem>,
  downloadDirSet: Map<string, IMenuItem>,
  statusCounts: StatusCountMap,
  ignoredTrackerPrefixesReg: RegExp
) {
  // labels 统计
  if (Array.isArray(t.labels) && t.labels.length > 0) {
    for (const l of t.labels) {
      const prev = labelsSet.get(l)
      labelsSet.set(l, { count: (prev?.count || 0) + 1 })
    }
  } else {
    const prev = labelsSet.get('noLabels')
    labelsSet.set('noLabels', { count: (prev?.count || 0) + 1, label: 'common.noLabels' })
  }

  // tracker 统计
  const trackerHosts = t.cachedTrackerHosts?.length
    ? t.cachedTrackerHosts
    : t.trackerStats.map((tracker: TrackerStat) => getNormalizedTrackerHost(tracker.host || '', ignoredTrackerPrefixesReg))
  if (trackerHosts.length > 0) {
    for (const host of trackerHosts) {
      const prev = trackerSet.get(host)
      trackerSet.set(host, { count: (prev?.count || 0) + 1 })
    }
  } else {
    const prev = trackerSet.get('noTracker')
    trackerSet.set('noTracker', { count: (prev?.count || 0) + 1, label: 'common.noTracker' })
  }

  // error 统计
  if (t.cachedError) {
    const prev = errorStringSet.get(t.cachedError)
    errorStringSet.set(t.cachedError, { count: (prev?.count || 0) + 1, color: 'var(--error-color)' })
  }

  // downloadDir 统计
  if (t.downloadDir) {
    const prev = downloadDirSet.get(t.downloadDir)
    downloadDirSet.set(t.downloadDir, { count: (prev?.count || 0) + 1 })
  }

  statusCounts.downloading += t.status === Status.downloading ? 1 : 0
  statusCounts.stopped += t.status === Status.stopped ? 1 : 0
  statusCounts.completed +=
    t.status === Status.seeding || (t.sizeWhenDone > 0 && Math.max(t.sizeWhenDone - t.haveValid, 0) === 0) ? 1 : 0
  statusCounts.verifying +=
    t.status === Status.verifying || t.status === Status.queuedToVerify || t.status === Status.queuedToDownload ? 1 : 0
  statusCounts.active += t.rateDownload > 0 || t.rateUpload > 0 ? 1 : 0
  statusCounts.inactive += t.rateDownload === 0 && t.rateUpload === 0 && t.status !== Status.stopped ? 1 : 0
  statusCounts.working += t.status !== Status.stopped ? 1 : 0
  statusCounts.error += t.error !== 0 || t.cachedError !== '' ? 1 : 0
  statusCounts.magnet += t.status === Status.downloading && t.pieceCount === 0 ? 1 : 0
}

// 将 map 转换成数组
export const mapToOptions = (map: Map<string, IMenuItem>, total: number) => {
  const $t = i18n.global.t
  return [
    { key: 'all', label: `${$t('common.all', { total })}`, icon: ShuffleOutline },
    ...Array.from(map.entries()).map(([item, value]) => {
      const label = isFunction(value.label)
        ? value.label($t)
        : typeof value.label === 'string' && value.label.includes('.')
          ? $t(value.label)
          : value.label
      return {
        key: item,
        label: `${label || item}（${value.count}）`,
        color: value?.color,
        icon: value?.icon
      } as {
        key: string
        label: string
        color?: string
        icon?: Component
      }
    })
  ]
}

export const statusCountsToMap = (statusCounts: StatusCountMap) => {
  const $t = i18n.global.t
  const map = new Map<string, IMenuItem>()
  statusFilters.forEach((filter) => {
    map.set(filter.key, {
      icon: filter.icon,
      color: filter.color,
      label: filter.label($t),
      count: statusCounts[filter.key] || 0
    })
  })
  return map
}

// 是否可以过滤这个种子
export interface TorrentFilterValues {
  search: string
  statusFilter: string
  labelsFilter: string
  trackerFilter: string
  errorStringFilter: string
  downloadDirFilter: string
}

export const matchesTorrentFilters = function (t: Torrent, filters: TorrentFilterValues) {
  const { search, statusFilter, labelsFilter, trackerFilter, errorStringFilter, downloadDirFilter } = filters
  // === 2. 同时进行过滤判断 ===
  let shouldInclude = true

  // 搜索过滤
  if (search && !t.name.includes(search)) {
    shouldInclude = false
  }

  // 状态过滤
  if (shouldInclude && statusFilter && statusFilter !== 'all' && !statusFilterFunMap.get(statusFilter)?.(t)) {
    shouldInclude = false
  }

  // 标签过滤
  if (
    shouldInclude &&
    labelsFilter &&
    labelsFilter !== 'all' &&
    !(labelsFilter == 'noLabels' && (!t.labels || t.labels.length === 0)) &&
    !t.labels.includes(labelsFilter)
  ) {
    shouldInclude = false
  }

  // tracker 过滤
  if (
    shouldInclude &&
    trackerFilter &&
    trackerFilter !== 'all' &&
    !(trackerFilter == 'noTracker' && t.trackerStats.length === 0) &&
    !t.trackerStats.some((tracker) => tracker.host.includes(trackerFilter))
  ) {
    shouldInclude = false
  }

  // 错误过滤
  if (shouldInclude && errorStringFilter && errorStringFilter !== 'all' && t.cachedError !== errorStringFilter) {
    shouldInclude = false
  }

  // 下载目录过滤
  if (
    shouldInclude &&
    downloadDirFilter &&
    downloadDirFilter !== 'all' &&
    (() => {
      const torrentDir = normalizeDownloadDirPath(t.downloadDir)
      const filterDir = normalizeDownloadDirPath(downloadDirFilter)

      if (torrentDir === filterDir) {
        return false
      }
      if (filterDir === '/') {
        return !torrentDir.startsWith('/')
      }
      return !torrentDir.startsWith(`${filterDir}/`)
    })()
  ) {
    shouldInclude = false
  }

  return shouldInclude
}

export const isFilterTorrents = function (
  t: Torrent,
  search: globalThis.Ref<string, string>,
  statusFilter: globalThis.Ref<string, string>,
  labelsFilter: globalThis.Ref<string, string>,
  trackerFilter: globalThis.Ref<string, string>,
  errorStringFilter: globalThis.Ref<string, string>,
  downloadDirFilter: globalThis.Ref<string, string>
) {
  return matchesTorrentFilters(t, {
    search: search.value,
    statusFilter: statusFilter.value,
    labelsFilter: labelsFilter.value,
    trackerFilter: trackerFilter.value,
    errorStringFilter: errorStringFilter.value,
    downloadDirFilter: downloadDirFilter.value
  })
}

// 排序
export const sortTorrents = function (
  filtered: Torrent[],
  sortKey: globalThis.Ref<string, string>,
  sortOrder: globalThis.Ref<string, string>
) {
  filtered.sort((a, b) => {
    const aValue = a[sortKey.value as keyof Torrent]
    const bValue = b[sortKey.value as keyof Torrent]
    // 处理 undefined/null
    if (aValue == null && bValue == null) {
      return 0
    }
    if (aValue == null) {
      return sortOrder.value === 'asc' ? -1 : 1
    }
    if (bValue == null) {
      return sortOrder.value === 'asc' ? 1 : -1
    }
    // 数字、字符串、日期
    let result = 0
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      result = sortOrder.value === 'asc' ? aValue - bValue : bValue - aValue
    } else if (typeof aValue === 'string' && typeof bValue === 'string') {
      result = sortOrder.value === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }
    // 其他类型（如布尔、对象等）
    // result = 0 时，说明字段值相等，需要二次排序
    if (result === 0 && sortKey.value !== 'name') {
      const aName = a.name || ''
      const bName = b.name || ''
      result = aName.localeCompare(bName)
    }
    return result
  })
}

// 获取 torrent 错误
export const getTorrentError = (t: Torrent): string => {
  let torrentError = t.errorString
  let trackerError = ''
  let noTrackerError = false

  for (const trackerStat of t.trackerStats) {
    let err = ''
    if ((trackerStat.hasAnnounced as boolean) && !(trackerStat.lastAnnounceSucceeded as boolean)) {
      err = trackerStat.lastAnnounceResult as string
    }
    if (err === '' || err === 'Success') {
      noTrackerError = true
    } else if (trackerError === '') {
      // If the torrent error string is equal to some tracker error string,
      // then igonore the global error string
      if (err === torrentError) {
        torrentError = ''
      }
      trackerError = `Tracker: ${err}`
    }
  }

  if (noTrackerError || t.status === Status.stopped) {
    return torrentError
  } else {
    return trackerError
  }
}

// 获取 tracker 状态
export const getTrackerAnnounceState = (tracker: TrackerStat) => {
  const $t = i18n.global.t
  if (tracker.announceState === 3) {
    return $t('statusFilter.working') + '(' + $t('status.uploading') + ')'
  }
  if (tracker.hasAnnounced) {
    if (tracker.lastAnnounceSucceeded) {
      return $t('statusFilter.working')
    }
    if (tracker.lastAnnounceResult === 'Success') {
      return $t('statusFilter.working')
    }
    return tracker.lastAnnounceResult
  }
  return ''
}

// 获取 tracker 状态
export const getTrackerStatus = (torrent: Torrent): string => {
  const trackers = torrent.trackerStats
  if (torrent.status === Status.stopped || trackers.length === 0) {
    return ''
  }
  return getTrackerAnnounceState(trackers[0])
}

export const portRe = /:\d+$/
export const prefixRe = /^((t|tr|tk|tracker|bt|open|opentracker)\d*)\.[^.]+\.[^.]+$/

// 获取 torrent 主要 tracker
export const getTorrentMainTracker = (torrent: Torrent): string => {
  if (torrent.trackerStats.length === 0) {
    return '没有 Tracker'
  }
  let host = torrent.trackerStats[0].host as string
  const portMatch = portRe.exec(host)
  if (portMatch != null) {
    host = host.substring(0, portMatch.index)
  }
  const prefixMatch = prefixRe.exec(host)
  if (prefixMatch != null) {
    host = host.substring(prefixMatch[1].length + 1)
  }
  return host
}

// 获取做种总数
export const getSeedsTotal = (torrent: Torrent): number => {
  let seeds = torrent.trackerStats.length > 0 ? 0 : -1
  torrent.trackerStats.forEach((tracker: TrackerStat) => {
    seeds = Math.max(seeds, tracker.seederCount as number)
  })
  return seeds
}

// 获取下载总数
export const getPeersTotal = (torrent: Torrent): number => {
  let peers = torrent.trackerStats.length > 0 ? 0 : -1
  torrent.trackerStats.forEach((tracker: TrackerStat) => {
    peers = Math.max(peers, tracker.leecherCount as number)
  })
  return peers
}

// 处理 torrent 数据
export const processTorrent = (torrent: Torrent) => {
  const trackerHosts = torrent.trackerStats.map((tracker) => getNormalizedTrackerHost(tracker.host || '', prefixRe))
  return {
    ...torrent,
    downloadDir: (torrent.downloadDir as string).replace(/\\/g, '/'),
    cachedError: getTorrentError(torrent),
    cachedTrackerStatus: getTrackerStatus(torrent),
    // 主要的 tracker，并进行格式化
    cachedMainTracker: getTorrentMainTracker(torrent),
    cachedTrackerHosts: trackerHosts,
    //做种总数
    cachedSeedsTotal: getSeedsTotal(torrent),
    // 当前下载总数
    cachedPeersTotal: getPeersTotal(torrent)
  }
}
