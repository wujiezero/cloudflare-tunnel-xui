<template>
  <el-dialog
    :model-value="modelValue"
    width="420px"
    class="panel-dialog create-modal"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
    @closed="resetForm"
  >
    <template #header>
      <span class="modal-title">新建 Tunnel</span>
    </template>

    <label class="field-label">Tunnel 名称</label>
    <el-input
      ref="nameInputRef"
      v-model="form.name"
      placeholder="例如 my-service.com"
      size="large"
      @keyup.enter="handleCreate"
    />
    <p class="modal-hint">创建后可在编辑页添加路由映射。</p>

    <button type="button" class="advanced-toggle" @click="showAdvanced = !showAdvanced">
      <el-icon class="chevron" :class="{ open: showAdvanced }"><ArrowRight /></el-icon>
      高级选项
    </button>
    <div v-if="showAdvanced" class="advanced-panel">
      <label class="field-label">Tunnel 密钥（可选）</label>
      <el-input v-model="form.tunnelSecret" placeholder="留空则由 Cloudflare 自动生成 32 字节密钥" />
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { nextTick, reactive, ref, watch } from "vue";
import { useTunnels } from "../../composables/useTunnels.js";
import { useApi } from "../../composables/useApi.js";

const props = defineProps({
  modelValue: { type: Boolean, default: false }
});
const emit = defineEmits(["update:modelValue", "created"]);

const { createTunnel } = useTunnels();
const { notify } = useApi();

const creating = ref(false);
const showAdvanced = ref(false);
const nameInputRef = ref(null);
const form = reactive({ name: "", tunnelSecret: "" });

function resetForm() {
  form.name = "";
  form.tunnelSecret = "";
  showAdvanced.value = false;
  creating.value = false;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) nextTick(() => nameInputRef.value?.focus());
  }
);

async function handleCreate() {
  if (!form.name.trim()) {
    notify("请输入 Tunnel 名称", "warning");
    return;
  }
  creating.value = true;
  try {
    const tunnel = await createTunnel({ name: form.name.trim(), tunnelSecret: form.tunnelSecret.trim() });
    emit("update:modelValue", false);
    emit("created", tunnel);
  } catch (e) {
    notify(e.message, "error");
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.modal-title { font-size: 16px; font-weight: 700; color: var(--text); }
.field-label { display: block; font-size: 12px; color: var(--text-2); margin-bottom: 6px; }
.modal-hint { margin: 8px 0 0; font-size: 12px; color: var(--text-2); }
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.advanced-toggle:hover { color: var(--accent); }
.advanced-toggle .chevron { font-size: 11px; transition: transform var(--motion-fast) var(--motion-ease); }
.advanced-toggle .chevron.open { transform: rotate(90deg); }
.advanced-panel { margin-top: 12px; animation: fade-in var(--motion-fast) ease; }
</style>
