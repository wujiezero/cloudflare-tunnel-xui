<template>
  <transition name="fade">
    <div v-if="loadingState.visible.value" class="global-loading">
      <div class="loading-card">
        <div class="loading-spinner"></div>
        <p class="loading-text">{{ loadingState.text.value }}</p>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { useGlobalLoading } from "../../composables/useGlobalLoading.js";

const loadingState = useGlobalLoading();
</script>

<style scoped>
.global-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  pointer-events: none;
}
.loading-card {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 180px;
  padding: 14px 18px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--card);
  box-shadow: var(--shadow-modal);
}
.loading-spinner {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 2px solid var(--accent-soft);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .loading-spinner { animation: none; }
  .fade-enter-active,
  .fade-leave-active { transition: none; }
}
</style>
