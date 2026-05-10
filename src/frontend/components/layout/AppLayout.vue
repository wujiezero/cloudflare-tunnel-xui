<template>
  <div class="app-layout">
    <AppSidebar />
    <main class="main-area">
      <AppTopbar
        :title="route.meta?.title || ''"
        :cloudflared="cloudflaredState.cloudflared"
        :tunnel-count="tunnelsState.tunnels.length"
      />
      <div class="content-area">
        <GlobalLoading />
        <router-view v-slot="{ Component, route: currentRoute }">
          <transition name="view-fade" mode="out-in">
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
  display: flex;
  min-height: 100vh;
}
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.content-area {
  position: relative;
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
.view-fade-enter-active,
.view-fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.view-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.view-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .view-fade-enter-active,
  .view-fade-leave-active {
    transition: none;
  }
  .view-fade-enter-from,
  .view-fade-leave-to {
    transform: none;
  }
}
</style>
