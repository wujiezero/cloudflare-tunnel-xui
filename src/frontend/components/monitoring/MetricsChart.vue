<template>
  <div class="chart-wrapper">
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
  label: { type: String, default: "" },
  color: { type: String, default: "#f38020" }
});

const canvasRef = ref(null);
let chartInstance = null;

function buildChartData(history) {
  const labels = history.map((h) => {
    const d = new Date(h.time);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  });
  const values = history.map((h) => {
    const v = h?.parsed?.[props.dataKey];
    if (v === "—" || v === undefined) return 0;
    const num = parseMetricNumber(v);
    return Number.isNaN(num) ? 0 : num;
  });
  return { labels, values };
}

function parseMetricNumber(value) {
  if (typeof value === "number") return value;
  const match = String(value).trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return Number.NaN;
  const unit = (match[2] || "").toUpperCase();
  const multipliers = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return Number(match[1]) * (multipliers[unit] || 1);
}

function renderChart() {
  if (!canvasRef.value || !props.history?.length) return;
  const { labels, values } = buildChartData(props.history);
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvasRef.value, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: props.label,
        data: values,
        borderColor: props.color,
        backgroundColor: props.color + "20",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: !!props.label } },
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.05)" } }
      }
    }
  });
}

watch(() => props.history, renderChart, { deep: true });
onMounted(renderChart);
onBeforeUnmount(() => { if (chartInstance) chartInstance.destroy(); });
</script>

<style scoped>
.chart-wrapper { width: 100%; height: 200px; }
</style>
