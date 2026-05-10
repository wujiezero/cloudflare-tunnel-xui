<template>
  <div class="sparkline-wrapper">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

const props = defineProps({
  history: { type: Array, default: () => [] },
  dataKey: { type: String, default: "activeConnections" },
  color: { type: String, default: "#67c23a" }
});

const canvasRef = ref(null);
let chartInstance = null;

function render() {
  if (!canvasRef.value || !props.history?.length) return;
  const values = props.history.map((h) => {
    const v = h?.parsed?.[props.dataKey];
    if (v === "—" || v === undefined) return 0;
    const num = parseFloat(v);
    return Number.isNaN(num) ? 0 : num;
  });

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvasRef.value, {
    type: "line",
    data: {
      labels: values.map(() => ""),
      datasets: [{ data: values, borderColor: props.color, borderWidth: 1.5, fill: false, tension: 0.3, pointRadius: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false, beginAtZero: true } }
    }
  });
}

watch(() => props.history, render, { deep: true });
onMounted(render);
onBeforeUnmount(() => { if (chartInstance) chartInstance.destroy(); });
</script>

<style scoped>
.sparkline-wrapper { width: 100%; height: 40px; }
</style>
