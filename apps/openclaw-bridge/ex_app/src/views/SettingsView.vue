<template>
  <section class="layout">
    <article class="card">
      <header class="card-header">
        <div>
          <p class="eyebrow">Per-user settings</p>
          <h2>Your OpenClaw defaults</h2>
          <p class="muted">These travel with the signed-in Nextcloud account and shape how chat/file actions start.</p>
        </div>
        <span class="pill">Synced with your user</span>
      </header>

      <div class="grid">
        <label>
          Preferred session key
          <input v-model="preferences.sessionKey" />
        </label>

        <label class="toggle-card">
          <input type="checkbox" v-model="preferences.sendFileContent" />
          <div>
            <strong>Include safe text previews</strong>
            <span>File actions may send text-like file content to OpenClaw when it is safe to preview.</span>
          </div>
        </label>

        <label class="toggle-card">
          <input type="checkbox" v-model="preferences.advancedModeNewTab" />
          <div>
            <strong>Open full OpenClaw in a new tab</strong>
            <span>Disable this if you want the full control UI to replace the current Nextcloud page.</span>
          </div>
        </label>
      </div>

      <div class="actions">
        <button @click="savePreferences" :disabled="savingPreferences">
          {{ savingPreferences ? 'Saving...' : 'Save preferences' }}
        </button>
      </div>

      <p v-if="preferencesSaved" class="ok">Preferences saved.</p>
      <p v-if="preferencesError" class="error">{{ preferencesError }}</p>
    </article>

    <article class="card">
      <header class="card-header">
        <div>
          <p class="eyebrow">Bridge summary</p>
          <h2>Operator-managed connection settings</h2>
          <p class="muted">
            Runtime endpoints and gateway configuration are part of the ExApp installation rather than your personal
            workspace.
          </p>
        </div>
        <span class="pill muted-pill">{{ canEditAdmin ? 'Local edit mode' : 'Managed in Nextcloud settings' }}</span>
      </header>

      <div class="summary-grid">
        <article class="summary-item">
          <strong>Gateway base URL</strong>
          <span>{{ admin.openclawGatewayBaseUrl || 'Not configured' }}</span>
        </article>
        <article class="summary-item">
          <strong>Chat backend</strong>
          <span>{{ admin.openclawChatBackend || 'auto' }}</span>
        </article>
        <article class="summary-item">
          <strong>Transport</strong>
          <span>{{ admin.openclawTransport || 'http' }}</span>
        </article>
        <article class="summary-item">
          <strong>Saved output folder</strong>
          <span>{{ admin.outputFolder || 'OpenClaw/Outputs' }}</span>
        </article>
        <article class="summary-item">
          <strong>Gateway token</strong>
          <span>{{ admin.gatewayTokenConfigured ? 'Configured' : 'Not configured' }}</span>
        </article>
      </div>

      <p v-if="!canEditAdmin" class="hint">
        Admin-facing bridge settings are already registered as Nextcloud declarative settings for this ExApp. Adjust
        them from Settings > Administration > OpenClaw Bridge rather than inside the workspace.
      </p>

      <template v-else>
        <div class="divider"></div>

        <div class="grid">
          <label>
            Gateway base URL
            <input v-model="admin.openclawGatewayBaseUrl" placeholder="http://127.0.0.1:18789" />
          </label>

          <label>
            Full control UI URL
            <input v-model="admin.openclawControlUiUrl" placeholder="https://cloud.example.com/apps/openclaw/" />
          </label>

          <label>
            Public WebSocket URL
            <input v-model="admin.openclawPublicWssUrl" placeholder="wss://cloud.example.com/openclaw/ws" />
          </label>

          <label>
            Reverse proxy WSS URL
            <input v-model="admin.reverseProxyWssPublicUrl" placeholder="wss://cloud.example.com/exapps/openclaw_bridge/ws" />
          </label>

          <label>
            Chat backend
            <select v-model="admin.openclawChatBackend">
              <option value="auto">auto</option>
              <option value="openclaw">openclaw</option>
              <option value="ollama">ollama</option>
            </select>
          </label>

          <label>
            Gateway transport
            <select v-model="admin.openclawTransport">
              <option value="http">http</option>
              <option value="ws">ws</option>
            </select>
          </label>

          <label>
            Output folder
            <input v-model="admin.outputFolder" placeholder="OpenClaw/Outputs" />
          </label>

          <label>
            Update gateway token
            <input
              v-model="admin.openclawGatewayToken"
              type="password"
              placeholder="Leave blank to keep the current token"
            />
            <small class="field-hint">Only used in local edit mode. Leave empty unless you want to replace it.</small>
          </label>

          <label>
            Ollama general URL
            <input v-model="admin.ollamaGeneralBaseUrl" placeholder="http://127.0.0.1:8090" />
          </label>

          <label>
            Ollama code URL
            <input v-model="admin.ollamaCodeBaseUrl" placeholder="http://127.0.0.1:8092" />
          </label>

          <label>
            Ollama embed URL
            <input v-model="admin.ollamaEmbedBaseUrl" placeholder="http://127.0.0.1:8091" />
          </label>

          <label>
            Preferred chat model
            <input v-model="admin.ollamaChatModel" placeholder="qwen2.5-coder:7b" />
          </label>

          <label>
            Preferred code model
            <input v-model="admin.ollamaCodeModel" placeholder="qwen2.5-coder:7b" />
          </label>

          <label>
            Preferred embed model
            <input v-model="admin.ollamaEmbedModel" placeholder="nomic-embed-text" />
          </label>
        </div>

        <label>
          Safe text MIME types
          <textarea
            v-model="admin.safeTextMimeTypes"
            rows="3"
            placeholder="text/plain, text/markdown, application/json"
          ></textarea>
        </label>

        <div class="toggle-grid">
          <label class="toggle-card">
            <input type="checkbox" v-model="admin.gatewayTokenBasedAuth" />
            <div>
              <strong>Gateway expects bearer auth</strong>
              <span>Use the configured token when talking to the OpenClaw gateway.</span>
            </div>
          </label>

          <label class="toggle-card">
            <input type="checkbox" v-model="admin.enableOpenAiCompatMode" />
            <div>
              <strong>Enable OpenAI-compatible mode</strong>
              <span>Operator-scoped compatibility endpoint. This is still not a per-user isolation boundary.</span>
            </div>
          </label>
        </div>

        <div class="actions">
          <button @click="saveAdmin" :disabled="savingAdmin">
            {{ savingAdmin ? 'Saving...' : 'Save bridge settings' }}
          </button>
        </div>

        <p v-if="adminSaved" class="ok">Bridge settings saved.</p>
        <p v-if="adminError" class="error">{{ adminError }}</p>
      </template>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { resolveAppApiContext } from '../appApi'

const appContext = resolveAppApiContext()
const canEditAdmin = computed(() => appContext.mode === 'local')

const preferences = ref({
  sessionKey: 'default',
  sendFileContent: true,
  advancedModeNewTab: true,
})

const admin = ref({
  openclawGatewayBaseUrl: '',
  openclawGatewayToken: '',
  gatewayTokenBasedAuth: false,
  gatewayTokenConfigured: false,
  openclawPublicWssUrl: '',
  reverseProxyWssPublicUrl: '',
  openclawControlUiUrl: '',
  openclawTransport: 'http',
  openclawChatBackend: 'auto',
  enableOpenAiCompatMode: false,
  ollamaGeneralBaseUrl: '',
  ollamaCodeBaseUrl: '',
  ollamaEmbedBaseUrl: '',
  ollamaChatModel: '',
  ollamaCodeModel: '',
  ollamaEmbedModel: '',
  outputFolder: 'OpenClaw/Outputs',
  safeTextMimeTypes: 'text/plain, text/markdown, application/json',
})

const savingPreferences = ref(false)
const preferencesSaved = ref(false)
const preferencesError = ref('')

const savingAdmin = ref(false)
const adminSaved = ref(false)
const adminError = ref('')

function normalizeAdmin(payload = {}) {
  return {
    openclawGatewayBaseUrl: payload.openclawGatewayBaseUrl || '',
    openclawGatewayToken: '',
    gatewayTokenBasedAuth: Boolean(payload.gatewayTokenBasedAuth),
    gatewayTokenConfigured: Boolean(payload.gatewayTokenConfigured),
    openclawPublicWssUrl: payload.openclawPublicWssUrl || '',
    reverseProxyWssPublicUrl: payload.reverseProxyWssPublicUrl || '',
    openclawControlUiUrl: payload.openclawControlUiUrl || '',
    openclawTransport: payload.openclawTransport || 'http',
    openclawChatBackend: payload.openclawChatBackend || 'auto',
    enableOpenAiCompatMode: Boolean(payload.enableOpenAiCompatMode),
    ollamaGeneralBaseUrl: payload.ollamaGeneralBaseUrl || '',
    ollamaCodeBaseUrl: payload.ollamaCodeBaseUrl || '',
    ollamaEmbedBaseUrl: payload.ollamaEmbedBaseUrl || '',
    ollamaChatModel: payload.ollamaChatModel || '',
    ollamaCodeModel: payload.ollamaCodeModel || '',
    ollamaEmbedModel: payload.ollamaEmbedModel || '',
    outputFolder: payload.outputFolder || 'OpenClaw/Outputs',
    safeTextMimeTypes: Array.isArray(payload.safeTextMimeTypes)
      ? payload.safeTextMimeTypes.join(', ')
      : payload.safeTextMimeTypes || '',
  }
}

async function load() {
  const [prefs, adminSettings] = await Promise.all([
    api.preferences(),
    api.adminSettings(),
  ])
  preferences.value = prefs
  admin.value = normalizeAdmin(adminSettings)
}

async function savePreferences() {
  savingPreferences.value = true
  preferencesSaved.value = false
  preferencesError.value = ''

  try {
    const response = await api.savePreferences(preferences.value)
    preferences.value = response.preferences
    preferencesSaved.value = true
  } catch (err) {
    preferencesError.value = err.message || 'Unable to save preferences.'
  } finally {
    savingPreferences.value = false
  }
}

async function saveAdmin() {
  savingAdmin.value = true
  adminSaved.value = false
  adminError.value = ''

  try {
    const payload = {
      openclawGatewayBaseUrl: admin.value.openclawGatewayBaseUrl,
      gatewayTokenBasedAuth: admin.value.gatewayTokenBasedAuth,
      openclawPublicWssUrl: admin.value.openclawPublicWssUrl,
      reverseProxyWssPublicUrl: admin.value.reverseProxyWssPublicUrl,
      openclawControlUiUrl: admin.value.openclawControlUiUrl,
      openclawTransport: admin.value.openclawTransport,
      openclawChatBackend: admin.value.openclawChatBackend,
      enableOpenAiCompatMode: admin.value.enableOpenAiCompatMode,
      ollamaGeneralBaseUrl: admin.value.ollamaGeneralBaseUrl,
      ollamaCodeBaseUrl: admin.value.ollamaCodeBaseUrl,
      ollamaEmbedBaseUrl: admin.value.ollamaEmbedBaseUrl,
      ollamaChatModel: admin.value.ollamaChatModel,
      ollamaCodeModel: admin.value.ollamaCodeModel,
      ollamaEmbedModel: admin.value.ollamaEmbedModel,
      outputFolder: admin.value.outputFolder,
      safeTextMimeTypes: admin.value.safeTextMimeTypes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    }
    if (admin.value.openclawGatewayToken.trim()) {
      payload.openclawGatewayToken = admin.value.openclawGatewayToken.trim()
    }

    const response = await api.saveAdminSettings(payload)
    admin.value = normalizeAdmin(response.settings)
    adminSaved.value = true
  } catch (err) {
    adminError.value = err.message || 'Unable to save bridge settings.'
  } finally {
    savingAdmin.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<style scoped>
.layout {
  display: grid;
  gap: 1rem;
}

.card {
  display: grid;
  gap: 1rem;
  background: var(--openclaw-panel-strong);
  border: 1px solid var(--openclaw-border);
  border-radius: 18px;
  padding: 1rem;
  box-shadow: 0 16px 30px rgba(18, 33, 50, 0.04);
}

.card-header {
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

h2 {
  margin: 0;
}

.muted,
.hint {
  color: var(--openclaw-muted);
}

.pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  border: 1px solid var(--openclaw-border);
  background: rgba(246, 250, 252, 0.9);
  color: var(--openclaw-accent-strong);
  font-size: 0.85rem;
  font-weight: 600;
}

.muted-pill {
  color: var(--openclaw-muted);
}

.grid,
.summary-grid,
.toggle-grid {
  display: grid;
  gap: 0.9rem;
}

.summary-item {
  display: grid;
  gap: 0.2rem;
  padding: 0.9rem 0.95rem;
  border-radius: 16px;
  border: 1px solid var(--openclaw-border);
  background: rgba(246, 250, 252, 0.85);
}

.summary-item span {
  color: var(--openclaw-muted);
  word-break: break-word;
}

.field-hint {
  color: var(--openclaw-muted);
  font-size: 0.85rem;
  font-weight: 500;
}

label {
  display: grid;
  gap: 0.35rem;
  font-weight: 600;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--openclaw-border-strong);
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  background: #fff;
}

textarea {
  resize: vertical;
}

.toggle-card {
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: 0.75rem;
  padding: 0.9rem 0.95rem;
  border-radius: 16px;
  border: 1px solid var(--openclaw-border);
  background: rgba(246, 250, 252, 0.85);
}

.toggle-card input {
  width: auto;
  margin-top: 0.2rem;
}

.toggle-card div {
  display: grid;
  gap: 0.2rem;
}

.toggle-card span {
  color: var(--openclaw-muted);
  font-weight: 500;
}

.actions {
  display: flex;
  gap: 0.75rem;
}

button {
  border: none;
  border-radius: 999px;
  padding: 0.7rem 1rem;
  background: var(--openclaw-accent);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.ok {
  color: #14764d;
}

.error {
  color: #bf2121;
}

.divider {
  height: 1px;
  background: var(--openclaw-border);
}

@media (min-width: 960px) {
  .grid,
  .summary-grid,
  .toggle-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .card-header {
    flex-direction: column;
  }
}
</style>
