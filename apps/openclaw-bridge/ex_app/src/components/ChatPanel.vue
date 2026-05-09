<template>
  <section class="chat-panel">
    <header class="panel-header">
      <div>
        <p class="eyebrow">Conversation</p>
        <h3>OpenClaw chat</h3>
      </div>

      <label class="session-field">
        <span>Session key</span>
        <input v-model="sessionKey" />
      </label>
    </header>

    <div class="context-row">
      <span v-if="props.fileIds.length > 0" class="context-pill">
        {{ props.fileIds.length }} selected file{{ props.fileIds.length === 1 ? '' : 's' }}
      </span>
      <span v-if="props.fileContext.length > 0" class="context-pill">
        {{ props.fileContext.length }} loaded preview{{ props.fileContext.length === 1 ? '' : 's' }}
      </span>
      <span class="context-pill">Saving to {{ outputFolder }}</span>
    </div>

    <div ref="messagesViewport" class="messages">
      <article v-for="item in messages" :key="item.id" :class="['message', item.role]">
        <strong>{{ item.role === 'assistant' ? 'OpenClaw' : 'You' }}</strong>
        <p>{{ item.content }}</p>
      </article>
      <p v-if="messages.length === 0" class="empty-state">
        This session is ready. Send a prompt or launch from Nextcloud Files to start with attached context.
      </p>
    </div>

    <label class="composer">
      <span>Prompt</span>
      <textarea v-model="prompt" rows="5" placeholder="Ask OpenClaw to summarize, draft, or inspect the selected files."></textarea>
    </label>

    <div class="toolbar">
      <label class="toggle">
        <input v-model="saveOutput" type="checkbox" />
        <span>Save reply back into {{ outputFolder }}</span>
      </label>

      <div class="actions">
        <button class="secondary" :disabled="loading" @click="loadHistory">Refresh history</button>
        <button class="primary" :disabled="loading || !prompt.trim()" @click="sendMessage">
          {{ loading ? 'Sending...' : 'Send to OpenClaw' }}
        </button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { api } from '../api'

const props = defineProps({
  initialPrompt: {
    type: String,
    default: '',
  },
  initialSessionKey: {
    type: String,
    default: 'default',
  },
  fileIds: {
    type: Array,
    default: () => [],
  },
  fileContext: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['output-saved'])

const prompt = ref(props.initialPrompt)
const sessionKey = ref(props.initialSessionKey)
const saveOutput = ref(false)
const outputFolder = ref('OpenClaw/Outputs')
const loading = ref(false)
const error = ref('')
const messages = ref([])
const messagesViewport = ref(null)

function normalizeMessage(item, index) {
  return {
    id: item.id || `${item.role || 'message'}-${index}`,
    role: item.role || 'assistant',
    content: item.content || item.message || item.reply || '',
  }
}

function applyHistory(history) {
  const localItems = Array.isArray(history?.local) ? history.local : []
  const remoteItems = Array.isArray(history?.remote?.items) ? history.remote.items : []
  const source = localItems.length > 0 ? localItems : remoteItems
  messages.value = source.map(normalizeMessage).filter((item) => item.content)
  scrollMessagesToEnd()
}

function scrollMessagesToEnd() {
  requestAnimationFrame(() => {
    if (messagesViewport.value) {
      messagesViewport.value.scrollTop = messagesViewport.value.scrollHeight
    }
  })
}

watch(
  () => props.initialPrompt,
  (value) => {
    prompt.value = value || ''
  },
  { immediate: true }
)

watch(
  () => props.initialSessionKey,
  (value) => {
    sessionKey.value = value || 'default'
  },
  { immediate: true }
)

async function loadHistory() {
  loading.value = true
  error.value = ''
  try {
    const history = await api.chatHistory(sessionKey.value)
    applyHistory(history)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadMeta() {
  try {
    const adminSettings = await api.adminSettings()
    outputFolder.value = adminSettings.outputFolder || 'OpenClaw/Outputs'
  } catch (err) {
    outputFolder.value = 'OpenClaw/Outputs'
  }
}

async function sendMessage() {
  loading.value = true
  error.value = ''
  try {
    const payload = {
      prompt: prompt.value,
      sessionKey: sessionKey.value,
      fileIds: props.fileIds,
      fileContext: props.fileContext,
      saveOutput: saveOutput.value,
    }
    const response = await api.sendChat(payload)
    messages.value.push(
      normalizeMessage(
        {
          id: `user-${Date.now()}`,
          role: 'user',
          content: prompt.value,
        },
        messages.value.length
      )
    )
    messages.value.push(
      normalizeMessage(
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.reply,
        },
        messages.value.length + 1
      )
    )
    prompt.value = ''
    scrollMessagesToEnd()
    if (response.savedOutput) {
      emit('output-saved', response.savedOutput)
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void Promise.all([loadHistory(), loadMeta()])
})
</script>

<style scoped>
.chat-panel {
  display: grid;
  gap: 1rem;
  background: var(--openclaw-panel-strong);
  border: 1px solid var(--openclaw-border);
  border-radius: 18px;
  padding: 1rem;
  box-shadow: 0 16px 30px rgba(18, 33, 50, 0.04);
}

.panel-header {
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

.session-field,
.composer {
  display: grid;
  gap: 0.35rem;
  font-weight: 600;
}

.context-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.context-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  background: rgba(10, 127, 99, 0.08);
  color: var(--openclaw-accent-strong);
  font-size: 0.85rem;
  font-weight: 600;
}

input,
textarea {
  width: 100%;
  border: 1px solid var(--openclaw-border-strong);
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  background: #fff;
}

.messages {
  display: grid;
  gap: 0.7rem;
  max-height: 28rem;
  overflow: auto;
  padding: 0.25rem;
}

.message {
  display: grid;
  gap: 0.35rem;
  padding: 0.85rem 0.95rem;
  border-radius: 16px;
  border: 1px solid var(--openclaw-border);
}

.message p,
.empty-state {
  margin: 0;
}

.message.user {
  background: #eef7f3;
}

.message.assistant {
  background: #f8f6f1;
}

.empty-state {
  padding: 1rem;
  border-radius: 16px;
  color: var(--openclaw-muted);
  background: rgba(246, 250, 252, 0.7);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 600;
}

.toggle input {
  width: auto;
}

.actions {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
}

button {
  border: none;
  border-radius: 999px;
  padding: 0.65rem 1rem;
  font-weight: 700;
  cursor: pointer;
}

.primary {
  background: var(--openclaw-accent);
  color: #fff;
}

.secondary {
  background: #fff;
  border: 1px solid var(--openclaw-border-strong);
  color: var(--openclaw-text);
}

.error {
  margin: 0;
  color: #b72121;
}

@media (max-width: 760px) {
  .panel-header,
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
