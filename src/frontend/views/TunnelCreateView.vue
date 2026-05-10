<template>
  <div class="create-page">
    <h3>新建 Tunnel</h3>
    <p style="color: var(--text-secondary, #999); margin: 0 0 20px;">填写名称和可选密钥即可创建新的 Cloudflare Tunnel。</p>

    <el-form @submit.prevent="handleCreate" label-position="top" style="max-width: 500px">
      <el-form-item label="Tunnel 名称" required>
        <el-input v-model="form.name" placeholder="例如: my-tunnel" />
      </el-form-item>
      <el-form-item label="Tunnel 密钥（可选）">
        <el-input v-model="form.tunnelSecret" placeholder="留空自动生成" />
        <div style="font-size:12px;color:var(--text-secondary,#999);margin-top:4px">
          留空则由 Cloudflare 自动生成 32 字节密钥
        </div>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="submit" :loading="creating">创建</el-button>
        <el-button @click="router.push('/tunnels')">取消</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
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
