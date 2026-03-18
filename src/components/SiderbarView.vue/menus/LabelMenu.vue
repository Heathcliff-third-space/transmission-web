<template>
  <n-menu
    :indent="8"
    :options="labelMenuOptions"
    :theme-overrides="sidebarMenuThemeOverrides"
    v-model:value="torrentStore.labelsFilter"
    v-model:expanded-keys="settingStore.menuExpandedKeys"
  />
</template>
<script setup lang="ts">
import { useTorrentStore, useSettingStore } from '@/store'
import { renderIcon } from '@/utils'
import { Pricetag, Pricetags } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { sidebarMenuThemeOverrides } from './menuThemeOverrides'

const torrentStore = useTorrentStore()
const settingStore = useSettingStore()
const { t: $t } = useI18n()
const labelMenuOptions = computed(() => {
  return [
    {
      label: $t('sidebar.labels'),
      key: 'labels',
      icon: renderIcon(Pricetags),
      children: torrentStore.labelsOptions.map((item) => ({
        ...item,
        icon: renderIcon(item.icon || Pricetag)
      }))
    }
  ]
})
</script>
