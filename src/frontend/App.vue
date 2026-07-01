<template>
  <LoginView v-if="!authenticated" @login-success="onLoginSuccess" />
  <AppLayout v-else />
  <ToastStack />
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from "vue";
import LoginView from "./views/LoginView.vue";
import AppLayout from "./components/layout/AppLayout.vue";
import ToastStack from "./components/common/ToastStack.vue";
import { useAuth } from "./composables/useAuth.js";
import { useCloudflared } from "./composables/useCloudflared.js";
import { useTheme } from "./composables/useTheme.js";

const { state: authState, checkSession } = useAuth();
const { refreshRuntimeStatus, startPolling, stopPolling } = useCloudflared();
const { initTheme } = useTheme();

const authenticated = computed(() => authState.authenticated);
let visibilityHandler = null;

async function onLoginSuccess() {
  await nextTick();
  await hydrateAuthenticatedApp();
}

async function hydrateAuthenticatedApp() {
  refreshRuntimeStatus();
  startPolling();
  bindVisibilityHandler();
}

function bindVisibilityHandler() {
  if (visibilityHandler) return;
  visibilityHandler = () => {
    if (document.hidden) {
      stopPolling();
    } else {
      refreshRuntimeStatus();
      startPolling();
    }
  };
  document.addEventListener("visibilitychange", visibilityHandler);
}

function unbindVisibilityHandler() {
  if (!visibilityHandler) return;
  document.removeEventListener("visibilitychange", visibilityHandler);
  visibilityHandler = null;
}

onMounted(async () => {
  initTheme();
  const ok = await checkSession();
  if (ok) {
    await nextTick();
    await hydrateAuthenticatedApp();
  }
});

watch(authenticated, (isAuthenticated) => {
  if (!isAuthenticated) {
    stopPolling();
    unbindVisibilityHandler();
  }
});

onBeforeUnmount(() => {
  stopPolling();
  unbindVisibilityHandler();
});
</script>

<style>
/* Root-level styles to ensure the app fills viewport */
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: var(--font-ui);
}
</style>
