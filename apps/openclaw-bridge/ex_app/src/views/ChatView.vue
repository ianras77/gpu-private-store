<template>
  <section class="layout">
    <article class="intro-card">
      <div>
        <p class="eyebrow">{{ fileIds.length > 0 ? 'Attached context' : 'Start from Nextcloud Files' }}</p>
        <h2>{{ fileIds.length > 0 ? `${fileIds.length} file${fileIds.length === 1 ? '' : 's'} attached` : 'No files attached yet' }}</h2>
        <p class="muted">
          {{
            fileIds.length > 0
              ? 'The selected documents are already resolved into prompt context for this session.'
              : 'Use the Files action menu when you want OpenClaw to start with a document set instead of a blank prompt.'
          }}
        </p>
      </div>

      <a
        v-if="showFilesLink"
        class="files-link"
        :href="filesHref"
        :target="appContext.navigationTarget"
        rel="noopener noreferrer"
      >
        Choose files in Nextcloud
      </a>
    </article>

    <div class="workspace-grid">
      <ChatPanel
        :initial-prompt="initialPrompt"
        :initial-session-key="preferences.sessionKey"
        :file-context="contextItems"
        :file-ids="fileIds"
        @output-saved="reloadOutputs"
      />

      <article v-if="contextItems.length" class="context-list">
        <header class="context-header">
          <div>
            <p class="eyebrow">Loaded context</p>
            <h3>Nextcloud file previews</h3>
          </div>
        </header>
        <FileContextCard v-for="item in contextItems" :key="item.fileId" :item="item" />
      </article>

      <article v-else-if="contextLoading" class="card muted-card">
        <p>Loading file context from Nextcloud...</p>
      </article>

      <article v-else-if="contextError" class="card error-card">
        <h3>File Context</h3>
        <p>{{ contextError }}</p>
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
import { buildFilesAppUrl, resolveAppApiContext } from '../appApi'

const route = useRoute()
const appContext = resolveAppApiContext()
const contextItems = ref([])
const contextError = ref('')
const contextLoading = ref(false)
const preferences = ref({ sessionKey: 'default' })
const showFilesLink = appContext.mode !== 'local'
const filesHref = buildFilesAppUrl('', appContext)
let activeContextRequest = 0

const fileIds = computed(() => {
  const value = route.query.fileIds
  if (!value) {
    return []
  }
  return String(value)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id))
})

const initialPrompt = computed(() => {
  const prompt = route.query.prompt
  if (prompt) {
    return String(prompt)
  }
  if (fileIds.value.length > 0) {
    return 'Use these as context and summarize key action items.'
  }
  return ''
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

function reloadOutputs() {
  // Reserved hook for parent usage.
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

.intro-card,
.card {
  background: var(--openclaw-panel-strong);
  border: 1px solid var(--openclaw-border);
  border-radius: 18px;
  padding: 1rem;
}

.intro-card {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.eyebrow {
  margin: 0 0 0.2rem;
  color: var(--openclaw-accent-strong);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.intro-card h2,
.context-list h3,
.card h3 {
  margin: 0;
}

.muted {
  color: var(--openclaw-muted);
}

.files-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0 1rem;
  border-radius: 999px;
  border: 1px solid var(--openclaw-border-strong);
  color: var(--openclaw-text);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
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

.muted-card {
  color: var(--openclaw-muted);
}

.error-card {
  border-color: rgba(191, 33, 33, 0.24);
  color: #8d2323;
}

@media (min-width: 1020px) {
  .workspace-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.95fr);
    align-items: start;
  }
}

@media (max-width: 760px) {
  .intro-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
