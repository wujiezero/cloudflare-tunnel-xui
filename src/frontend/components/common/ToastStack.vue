<template>
  <div class="toast-stack">
    <transition-group name="toast">
      <div v-for="t in state.toasts" :key="t.id" class="toast-item surface-card">
        <span class="toast-icon" :class="t.kind">
          <el-icon v-if="t.kind === 'success'"><Check /></el-icon>
          <el-icon v-else-if="t.kind === 'danger'"><Close /></el-icon>
          <template v-else-if="t.kind === 'warning'">!</template>
          <template v-else>i</template>
        </span>
        <span class="toast-text">{{ t.text }}</span>
        <button v-if="t.actionLabel" class="toast-action" type="button" @click="handleAction(t)">
          {{ t.actionLabel }}
        </button>
        <button class="toast-dismiss" type="button" aria-label="关闭" @click="dismissToast(t.id)">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { useToast } from "../../composables/useToast.js";

const { state, dismissToast } = useToast();

function handleAction(toast) {
  toast.onAction?.();
  dismissToast(toast.id);
}
</script>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}
.toast-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 14px;
  border-color: var(--border-strong);
  border-radius: 11px;
  box-shadow: var(--shadow-toast);
  pointer-events: auto;
}
.toast-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
  font-size: 12px;
  font-weight: 700;
}
.toast-icon .el-icon { font-size: 10px; }
.toast-icon.success { background: var(--success-soft); color: var(--success); }
.toast-icon.warning { background: var(--warning-soft); color: var(--warning); }
.toast-icon.danger  { background: var(--danger-soft);  color: var(--danger); }
.toast-icon.info    { background: var(--accent-soft);  color: var(--accent); }
.toast-text {
  flex: 1;
  font-size: var(--fs-sm);
  color: var(--text);
  padding-top: 1px;
  line-height: var(--lh-base);
}
.toast-action {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text);
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.toast-action:hover { border-color: var(--accent); color: var(--accent); }
.toast-dismiss {
  flex-shrink: 0;
  display: flex;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}
.toast-dismiss:hover { color: var(--text-2); }
.toast-dismiss .el-icon { font-size: 12px; }

.toast-enter-active { animation: fade-in var(--motion-normal) ease; }
.toast-leave-active { transition: opacity var(--motion-fast) ease, transform var(--motion-fast) ease; position: absolute; }
.toast-leave-to { opacity: 0; transform: translateX(12px); }
.toast-move { transition: transform var(--motion-normal) var(--motion-ease); }

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active, .toast-leave-active, .toast-move { animation: none; transition: none; }
}
</style>
