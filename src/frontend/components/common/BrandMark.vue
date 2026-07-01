<template>
  <div class="brand-mark" :style="{ width: size + 'px', height: size + 'px', borderRadius: radius + 'px' }">
    <svg :width="Math.round(size * 0.53)" :height="Math.round(size * 0.53)" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="6" stroke="white" stroke-width="1.8" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="2.6" stroke="white" stroke-width="1.8" />
    </svg>
  </div>
</template>

<script setup>
defineProps({
  size: { type: Number, default: 36 },
  radius: { type: Number, default: 10 }
});
</script>

<style scoped>
.brand-mark {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  /* Cloudflare orange reserved for the logo mark only */
  background: linear-gradient(135deg, var(--brand-orange), var(--brand-orange-2));
}
</style>
