import { useApi } from "./useApi.js";

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // fall through to legacy path
    }
  }

  // Legacy fallback for non-secure contexts (e.g. plain http LAN access).
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch (_) {
    return false;
  }
}

export function useClipboard() {
  const { notify } = useApi();

  async function copyText(text, label = "内容") {
    const value = String(text ?? "").trim();
    if (!value) {
      notify(`没有可复制的${label}`, "warning");
      return false;
    }
    const ok = await writeClipboard(value);
    if (ok) {
      notify(`${label}已复制`);
    } else {
      notify(`复制失败，请手动复制`, "error");
    }
    return ok;
  }

  return { copyText };
}
