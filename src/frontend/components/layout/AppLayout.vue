<template>
  <div class="app-layout liquid-shell">
    <AppSidebar />
    <main class="main-area scroll-thin">
      <AppTopbar
        :title="route.meta?.title || ''"
        :cloudflared="cloudflaredState.cloudflared"
        :tunnel-count="tunnelsState.tunnels.length"
      />
      <div class="content-area">
        <GlobalLoading />
        <router-view v-slot="{ Component, route: currentRoute }">
          <transition name="view-slide-fade" mode="out-in" appear>
            <component :is="Component" :key="currentRoute.fullPath" />
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<script setup>
import { useRoute } from "vue-router";
import AppSidebar from "./AppSidebar.vue";
import AppTopbar from "./AppTopbar.vue";
import GlobalLoading from "../common/GlobalLoading.vue";
import { useCloudflared } from "../../composables/useCloudflared.js";
import { useTunnels } from "../../composables/useTunnels.js";

const route = useRoute();
const { state: cloudflaredState } = useCloudflared();
const { state: tunnelsState } = useTunnels();
</script>

<style scoped>
.app-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 18px;
  min-height: 100vh;
  padding: 18px;
}
.main-area {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.content-area {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 20px 4px 2px 0;
  overflow-y: auto;
  transition: padding var(--motion-normal) var(--motion-ease);
}
@media (prefers-reduced-motion: reduce) {
  .content-area {
    scroll-behavior: auto;
  }
}
@media (max-width: 900px) {
  .app-layout {
    grid-template-columns: 1fr;
    padding: 12px;
  }
  .content-area {
    padding: 12px 0 0;
  }
}
</style>
