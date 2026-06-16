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
  border: 1px solid var(--line, rgba(92, 126, 178, 0.18));
  border-radius: 14px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.72), rgba(248, 251, 255, 0.48));
  box-shadow: var(--shadow-soft, 0 10px 28px rgba(50, 80, 130, 0.10));
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
}
.loading-spinner {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 2px solid var(--primary-soft, rgba(42, 109, 246, 0.18));
  border-top-color: var(--primary, #2a6df6);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text {
  margin: 0;
  color: var(--text, #1b2b44);
  font-size: 13px;
  font-weight: 600;
}
[data-theme="dark"] .loading-card {
  background: linear-gradient(160deg, rgba(24, 40, 64, 0.82), rgba(18, 28, 48, 0.62));
  border-color: rgba(100, 140, 200, 0.22);
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
