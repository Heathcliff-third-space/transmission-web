<template>
  <section class="dir-menu">
    <button class="dir-menu__header" type="button" @click="toggleDirExpanded">
      <span class="dir-menu__header-main">
        <n-icon size="18" color="var(--text-color-2)">
          <FileTray />
        </n-icon>
        <span class="dir-menu__header-title">{{ $t('sidebar.directory') }}</span>
      </span>
      <n-icon
        size="16"
        color="var(--text-color-3)"
        class="dir-menu__header-arrow"
        :class="{ 'dir-menu__header-arrow--expanded': isDirExpanded }"
      >
        <ChevronDown />
      </n-icon>
    </button>

    <div v-show="isDirExpanded" class="dir-menu__body">
      <n-tree
        block-line
        selectable
        :data="dirTreeOptions"
        :expanded-keys="expandedKeys"
        :selected-keys="selectedKeys"
        :render-label="renderLabel"
        :render-prefix="renderPrefix"
        :render-suffix="renderSuffix"
        class="dir-tree"
        @update:expanded-keys="onUpdateExpandedKeys"
        @update:selected-keys="onUpdateSelectedKeys"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DownloadDirTreeOption } from '@/store/torrentUtils'
import { useSettingStore, useTorrentStore } from '@/store'
import { copyToClipboard, formatSize } from '@/utils'
import { ChevronDown, CopyOutline, FileTray, Folder } from '@vicons/ionicons5'
import { NIcon, type TreeOption, useMessage } from 'naive-ui'
import { h } from 'vue'
import { useI18n } from 'vue-i18n'

const torrentStore = useTorrentStore()
const settingStore = useSettingStore()
const { t: $t } = useI18n()
const message = useMessage()

const expandedKeys = useStorage<string[]>('dirTreeExpandedKeys', [])

const dirTreeOptions = computed<TreeOption[]>(() => [
  {
    key: 'all',
    label: $t('common.all', { total: torrentStore.torrents.length }),
    count: torrentStore.torrents.length,
    size: torrentStore.downloadDirTotalSize,
    children: torrentStore.downloadDirTreeOptions
  }
])

const selectedKeys = computed(() => [torrentStore.downloadDirFilter || 'all'])
const isDirExpanded = computed(() => settingStore.menuExpandedKeys.includes('dir'))

function toggleDirExpanded() {
  if (isDirExpanded.value) {
    settingStore.menuExpandedKeys = settingStore.menuExpandedKeys.filter((key) => key !== 'dir')
  } else {
    settingStore.menuExpandedKeys = [...settingStore.menuExpandedKeys, 'dir']
  }
}

function onUpdateExpandedKeys(keys: Array<string | number>) {
  expandedKeys.value = keys.map(String)
}

function onUpdateSelectedKeys(keys: Array<string | number>) {
  torrentStore.downloadDirFilter = String(keys[0] || 'all')
  if (!isDirExpanded.value) {
    toggleDirExpanded()
  }
}

function renderPrefix({ option, selected }: { option: TreeOption; selected: boolean }) {
  const node = option as DownloadDirTreeOption
  const icon = node.key === 'all' ? FileTray : Folder
  return h(
    NIcon,
    {
      size: 18,
      color: selected ? 'var(--primary-color)' : 'var(--text-color-2)'
    },
    {
      default: () => h(icon)
    }
  )
}

function renderLabel({ option }: { option: TreeOption }) {
  const node = option as DownloadDirTreeOption
  return h('div', { class: 'dir-tree-label' }, [
    h(
      'span',
      {
        class: 'dir-tree-label__name',
        title: node.key === 'all' ? node.label : node.key
      },
      node.label
    ),
    h('span', { class: 'dir-tree-label__meta' }, `${node.count} | ${formatSize(node.size)}`)
  ])
}

function renderSuffix({ option }: { option: TreeOption }) {
  const node = option as DownloadDirTreeOption
  if (node.key === 'all') {
    return null
  }

  return h(
    'button',
    {
      type: 'button',
      class: 'dir-tree-copy-button',
      title: $t('sidebar.copyDirectory'),
      'aria-label': $t('sidebar.copyDirectory'),
      onMousedown: (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
      },
      onClick: async (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        const success = await copyToClipboard(String(node.key))
        if (success) {
          message.success($t('messages.directoryCopied'))
        } else {
          message.error($t('messages.copyFailed'))
        }
      }
    },
    [
      h(
        NIcon,
        {
          size: 14
        },
        {
          default: () => h(CopyOutline)
        }
      )
    ]
  )
}
</script>

<style scoped lang="less">
.dir-tree {
  padding-left: 28px;

  :deep(.n-tree-node) {
    min-height: 32px;
  }

  :deep(.n-tree-node-content) {
    min-height: 32px;
    width: 100%;
  }

  :deep(.n-tree-node-content__text) {
    flex: 1;
    min-width: 0;
  }

  :deep(.n-tree-node-content__suffix) {
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
  }

  :deep(.n-tree-node-content:hover .dir-tree-copy-button),
  :deep(.n-tree-node--selected .dir-tree-copy-button),
  :deep(.n-tree-node-content:focus-within .dir-tree-copy-button) {
    opacity: 1;
    pointer-events: auto;
  }
}

:deep(.dir-tree-label) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
  font-size: 0.8rem;
}

:deep(.dir-tree-label__name) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.dir-tree-label__meta) {
  flex-shrink: 0;
  color: var(--text-color-3);
  font-variant-numeric: tabular-nums;
}

:deep(.dir-tree-copy-button) {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    background-color 0.15s ease;
}

:deep(.dir-tree-copy-button:hover) {
  color: var(--primary-color);
  background-color: var(--hover-color);
}

.dir-menu {
  user-select: none;
}

.dir-menu__header {
  width: 100%;
  height: 32px;
  border: none;
  background: transparent;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 0 10px;
  color: var(--text-color-2);
  font-size: 0.8rem;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.dir-menu__header:hover {
  background-color: var(--hover-color);
  color: var(--text-color-1);
}

.dir-menu__header-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dir-menu__header-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-menu__header-arrow {
  transition: transform 0.2s ease;
}

.dir-menu__header-arrow--expanded {
  transform: rotate(180deg);
}

.dir-menu__body {
  padding-bottom: 4px;
}
</style>
