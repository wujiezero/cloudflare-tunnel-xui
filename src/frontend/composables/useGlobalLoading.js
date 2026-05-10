import { shallowRef, triggerRef } from "vue";

const loadingCount = shallowRef(0);
const showTimer = shallowRef(null);
const visible = shallowRef(false);
const text = shallowRef("处理中...");

export function useGlobalLoading() {
  function open(textContent) {
    if (textContent) text.value = textContent;
    loadingCount.value++;
    if (showTimer.value === null) {
      showTimer.value = setTimeout(() => {
        if (loadingCount.value > 0) {
          visible.value = true;
        }
        showTimer.value = null;
      }, 160);
    }
  }

  function close() {
    loadingCount.value--;
    if (loadingCount.value <= 0) {
      loadingCount.value = 0;
      visible.value = false;
      if (showTimer.value !== null) {
        clearTimeout(showTimer.value);
        showTimer.value = null;
      }
    }
  }

  async function withGlobalLoading(action, loadingText) {
    open(loadingText);
    try {
      return await action();
    } finally {
      close();
    }
  }

  return { loadingCount, visible, text, open, close, withGlobalLoading };
}
