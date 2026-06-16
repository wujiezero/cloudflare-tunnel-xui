<template>
  <div class="create-page page-shell">
    <teleport to="#topbar-actions">
      <el-button text @click="router.push('/tunnels')">
        <el-icon class="el-icon--left"><Back /></el-icon>返回列表
      </el-button>
    </teleport>

    <div class="surface-card create-panel">
      <div class="panel-head">
        <span class="panel-icon"><el-icon><Plus /></el-icon></span>
        <div>
          <h3 class="section-title">新建 Tunnel</h3>
          <p class="create-desc">填写名称和可选密钥即可创建新的 Cloudflare Tunnel。</p>
        </div>
      </div>

      <el-form @submit.prevent="handleCreate" label-position="top" class="create-form">
        <el-form-item label="Tunnel 名称" required>
          <el-input v-model="form.name" placeholder="例如: my-tunnel" size="large">
            <template #prefix><el-icon><Connection /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item label="Tunnel 密钥（可选）">
          <el-input v-model="form.tunnelSecret" placeholder="留空自动生成" size="large">
            <template #prefix><el-icon><Key /></el-icon></template>
          </el-input>
          <div class="field-hint"><el-icon><InfoFilled /></el-icon>留空则由 Cloudflare 自动生成 32 字节密钥。</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="creating" :icon="Check">创建 Tunnel</el-button>
          <el-button @click="router.push('/tunnels')">取消</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { Back, Plus, Check, Connection, Key, InfoFilled } from "@element-plus/icons-vue";
import { useTunnels } from "../composables/useTunnels.js";
import { useApi } from "../composables/useApi.js";

const router = useRouter();
const { createTunnel } = useTunnels();
const { notify } = useApi();
const creating = ref(false);
const form = reactive({ name: "", tunnelSecret: "" });

async function handleCreate() {
  if (!form.name.trim()) {
    notify("请输入 Tunnel 名称", "warning");
    return;
  }
  creating.value = true;
  try {
    await createTunnel({ name: form.name, tunnelSecret: form.tunnelSecret });
    router.push("/tunnels");
  } catch (e) {
    notify(e.message, "error");
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.create-panel { max-width: 560px; padding: var(--space-6); }
.panel-head { display: flex; gap: var(--space-3); margin-bottom: var(--space-5); }
.panel-icon {
  flex-shrink: 0;
  display: grid; place-items: center;
  width: 40px; height: 40px; border-radius: var(--radius-sm);
  background: var(--primary-soft); color: var(--primary); font-size: 20px;
}
.create-desc { margin: 4px 0 0; color: var(--text-secondary); font-size: var(--fs-sm); }
.create-form { max-width: 100%; }
.field-hint {
  display: flex; align-items: center; gap: 5px;
  margin-top: 6px; color: var(--text-secondary); font-size: var(--fs-xs);
}
.field-hint .el-icon { color: var(--primary); }
</style>
