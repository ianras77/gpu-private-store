<template>
  <section class="card">
    <header>
      <div>
        <p class="eyebrow">Bridge health</p>
        <h3>Gateway status</h3>
      </div>
      <button @click="loadStatus" :disabled="loading">Refresh</button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-else-if="status" class="status-grid">
      <div class="status-pill" :class="status.reachable ? 'ok' : 'bad'">
        {{ status.reachable ? 'Reachable' : 'Unavailable' }}
      </div>
      <div class="metric">
        <strong>{{ status.latencyMs ? `${status.latencyMs} ms` : '--' }}</strong>
        <span>last probe</span>
      </div>
      <div class="metric">
        <strong>{{ status.statusCode || '--' }}</strong>
        <span>status code</span>
      </div>
    </div>

    <small v-if="status" class="detail">{{ status.detail }}</small>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api'

const status = ref(null)
const error = ref('')
const loading = ref(false)

async function loadStatus() {
  loading.value = true
  error.value = ''
  try {
    status.value = await api.gatewayStatus()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadStatus()
})
</script>

<style scoped>
.card {
  display: grid;
  gap: 1rem;
  background: var(--openclaw-panel-strong);
  border: 1px solid var(--openclaw-border);
  border-radius: 18px;
  padding: 1rem;
  box-shadow: 0 16px 30px rgba(18, 33, 50, 0.04);
}

header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.eyebrow {
  margin: 0 0 0.2rem;
  color: var(--openclaw-accent-strong);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

h3 {
  margin: 0;
}

.status-grid {
  display: grid;
  gap: 0.75rem;
}

.status-pill,
.metric {
  display: grid;
  gap: 0.15rem;
  padding: 0.85rem 0.9rem;
  border-radius: 14px;
  border: 1px solid var(--openclaw-border);
  background: rgba(246, 250, 252, 0.85);
}

.status-pill {
  font-weight: 700;
}

.metric span,
.detail {
  color: var(--openclaw-muted);
}

.ok {
  color: #0d8d34;
}

.bad,
.error {
  color: #b51f1f;
}

.detail {
  word-break: break-word;
}

button {
  border: 1px solid var(--openclaw-border-strong);
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
  background: #fff;
  cursor: pointer;
}

@media (min-width: 900px) {
  .status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
