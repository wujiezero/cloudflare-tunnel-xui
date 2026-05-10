import { reactive } from "vue";
import { ElMessage } from "element-plus";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const csrfState = reactive({ token: "", priming: null });

async function primeCsrfToken() {
  if (csrfState.token) return;
  if (!csrfState.priming) {
    csrfState.priming = fetch("/api/auth/me", {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" }
    })
      .then((response) => {
        const token = response.headers.get("x-csrf-token");
        if (token) {
          csrfState.token = token;
        }
      })
      .finally(() => {
        csrfState.priming = null;
      });
  }
  await csrfState.priming;
}

export function useApi() {
  async function api(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    if (MUTATING_METHODS.has(method) && !csrfState.token) {
      await primeCsrfToken();
    }

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (MUTATING_METHODS.has(method) && csrfState.token) {
      headers["X-CSRF-Token"] = csrfState.token;
    }

    const response = await fetch(path, {
      headers,
      credentials: "same-origin",
      ...options
    });

    const nextCsrfToken = response.headers.get("x-csrf-token");
    if (nextCsrfToken) {
      csrfState.token = nextCsrfToken;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const err = new Error(payload?.message || `Request failed: ${response.status}`);
      err.status = response.status;
      throw err;
    }

    return payload;
  }

  function notify(message, type = "success") {
    ElMessage({ message, type, grouping: true });
  }

  return { api, notify, csrfToken: csrfState };
}
