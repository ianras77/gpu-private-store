<template>
  <section class="layout">
    <article class="action-hero">
      <div>
        <p class="eyebrow">Sent from Nextcloud Files</p>
        <h2>{{ actionLabel }}</h2>
        <p class="muted">{{ promptSeed }}</p>
      </div>

      <div class="selection-summary">
        <strong>{{ fileIds.length }}</strong>
        <span>selected file{{ fileIds.length === 1 ? '' : 's' }}</span>
      </div>
    </article>

    <div class="workspace-grid">
      <ChatPanel
        :initial-prompt="promptSeed"
        :initial-session-key="preferences.sessionKey"
        :file-context="contextItems"
        :file-ids="fileIds"
      />

      <article class="context-list">
        <header class="context-header">
          <div>
            <p class="eyebrow">Selection</p>
            <h3>Documents attached from Files</h3>
          </div>
        </header>

        <FileContextCard v-for="item in contextItems" :key="item.fileId" :item="item" />
        <p v-if="contextLoading" class="muted">Loading file context from Nextcloud...</p>
        <p v-else-if="contextError" class="error">{{ contextError }}</p>
        <p v-else-if="contextItems.length === 0" class="muted">No file context found for the supplied file IDs.</p>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ChatPanel from '../components/ChatPanel.vue'
import FileContextCard from '../components/FileContextCard.vue'
import { api } from '../api'

const route = useRoute()
const contextItems = ref([])
const contextError = ref('')
const contextLoading = ref(false)
const preferences = ref({ sessionKey: 'default' })
let activeContextRequest = 0

const fileIds = computed(() => {
  const ids = route.query.fileIds || route.query.fileId || ''
  return String(ids)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value))
})

const action = computed(() => String(route.query.action || 'ask'))

const actionLabel = computed(() => {
  if (action.value === 'summarize') {
    return 'Summarize with OpenClaw'
  }
  if (action.value === 'add') {
    return 'Add to OpenClaw workspace'
  }
  return 'Ask OpenClaw about this file'
})

const promptSeed = computed(() => {
  if (action.value === 'summarize') {
    return 'Summarize these files and highlight the most important takeaways.'
  }
  if (action.value === 'add') {
    return 'Use these files as context for the current workspace.'
  }
  return 'Review these files and call out action items, risks, or follow-ups.'
})

async function load() {
  preferences.value = await api.preferences()
}

async function loadContext() {
  const requestId = ++activeContextRequest
  contextLoading.value = true
  contextError.value = ''

  try {
    if (fileIds.value.length === 0) {
      contextItems.value = []
      return
    }

    const response = await api.fileContext(fileIds.value, undefined)
    if (requestId === activeContextRequest) {
      contextItems.value = response.items || []
    }
  } catch (err) {
    if (requestId === activeContextRequest) {
      contextItems.value = []
      contextError.value = err.message || 'Unable to load file context.'
    }
  } finally {
    if (requestId === activeContextRequest) {
      contextLoading.value = false
    }
  }
}

onMounted(() => {
  void load()
})

watch(
  () => route.fullPath,
  () => {
    void loadContext()
  },
  { immediate: true }
)
</script>

<style scoped>
.layout {
  display: grid;
  gap: 1rem;
}

.action-hero,
.context-list {
  background: var(--openclaw-panel-strong);
  border: 1px solid var(--openclaw-border);
  border-radius: 18px;
  padding: 1rem;
}

.action-hero {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  background: linear-gradient(120deg, rgba(10, 127, 99, 0.08) 0%, rgba(245, 247, 250, 0.95) 100%);
}

.eyebrow {
  margin: 0 0 0.2rem;
  color: var(--openclaw-accent-strong);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.action-hero h2,
.context-list h3 {
  margin: 0;
}

.muted {
  color: var(--openclaw-muted);
}

.selection-summary {
  display: grid;
  gap: 0.15rem;
  min-width: 8rem;
  padding: 0.8rem 0.9rem;
  border-radius: 16px;
  border: 1px solid var(--openclaw-border);
  background: #fff;
  text-align: center;
}

.workspace-grid {
  display: grid;
  gap: 1rem;
}

.context-list {
  display: grid;
  gap: 0.75rem;
}

.context-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.error {
  color: #b72121;
}

@media (min-width: 1020px) {
  .workspace-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.95fr);
    align-items: start;
  }
}

@media (max-width: 760px) {
  .action-hero {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
