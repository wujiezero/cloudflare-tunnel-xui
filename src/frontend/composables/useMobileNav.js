import { reactive } from "vue";

const state = reactive({ isOpen: false });

export function useMobileNav() {
  function open() {
    state.isOpen = true;
  }
  function close() {
    state.isOpen = false;
  }
  function toggle() {
    state.isOpen = !state.isOpen;
  }
  return { state, open, close, toggle };
}
