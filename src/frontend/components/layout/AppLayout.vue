<template>
  <div class="app-shell">
    <AppSidebar />
    <main class="main-area scroll-thin">
      <AppTopbar />
      <div class="content-area content-texture">
        <GlobalLoading />
        <div class="content-inner">
          <router-view v-slot="{ Component, route: currentRoute }">
            <transition name="view-slide-fade" mode="out-in" appear>
              <component v-if="Component" :is="Component" :key="currentRoute.fullPath" />
            </transition>
          </router-view>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import AppSidebar from "./AppSidebar.vue";
import AppTopbar from "./AppTopbar.vue";
import GlobalLoading from "../common/GlobalLoading.vue";
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}
.main-area {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.content-area {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.content-inner {
  max-width: 1320px;
  margin: 0 auto;
  padding: 28px 32px 56px;
}
@media (max-width: 720px) {
  .content-inner { padding: 20px 16px 40px; }
}
@media (prefers-reduced-motion: reduce) {
  .content-area { scroll-behavior: auto; }
}
</style>
