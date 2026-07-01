import { reactive } from "vue";

const state = reactive({ toasts: [] });
let counter = 0;

function dismissToast(id) {
  const idx = state.toasts.findIndex((t) => t.id === id);
  if (idx !== -1) state.toasts.splice(idx, 1);
}

function pushToast(text, kind = "info", extra = {}) {
  const id = `toast-${Date.now()}-${counter++}`;
  state.toasts.push({ id, text, kind, ...extra });
  setTimeout(() => dismissToast(id), extra.sticky ? 6000 : 3400);
  return id;
}

export function useToast() {
  return { state, pushToast, dismissToast };
}
