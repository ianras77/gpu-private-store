<template>
  <section class="layout">
    <article class="hero card">
      <div class="hero-copy">
        <p class="eyebrow">Nextcloud desktop flow</p>
        <h2>Keep OpenClaw in the same place you work with files.</h2>
        <p class="muted">
          Move from Files into chat, keep the current session alive, and save replies back into
          <strong>{{ outputFolder }}</strong>.
        </p>
      </div>

      <div class="hero-actions">
        <RouterLink class="primary-action" to="/chat">Open chat</RouterLink>
        <RouterLink class="secondary-action" to="/settings">Review preferences</RouterLink>
        <LaunchFullControlButton :new-tab="preferences.advancedModeNewTab" />
      </div>

      <dl class="hero-stats">
        <div>
          <dt>Session</dt>
          <dd>{{ preferences.sessionKey || 'default' }}</dd>
        </div>
        <div>
          <dt>Saved outputs</dt>
          <dd>{{ outputs.length }}</dd>
        </div>
        <div>
          <dt>Backend</dt>
          <dd>{{ ollama.chatBackend || 'auto' }}</dd>
        </div>
      </dl>
    </article>

    <GatewayStatusCard />

    <article class="card">
      <div class="section-head">
        <div>
          <h3>Workspace shortcuts</h3>
          <p class="muted">Use the same browser context for Files, saved outputs, and OpenClaw.</p>
        </div>
      </div>

      <div class="shortcut-grid">
        <a
          v-for="item in shortcuts"
          :key="item.label"
          class="shortcut"
          :href="item.href"
          :target="item.target"
          rel="noopener noreferrer"
        >
          <strong>{{ item.label }}</strong>
          <span>{{ item.description }}</span>
        </a>
      </div>
    </article>

    <article class="card">
      <div class="section-head">
        <div>
          <h3>Recent saved outputs</h3>
          <p class="muted">Replies appear here once you save them back into Nextcloud from chat.</p>
        </div>
        <a
          v-if="appContext.mode !== 'local'"
          class="inline-link"
          :href="outputsFolderHref"
          :target="appContext.navigationTarget"
          rel="noopener noreferrer"
        >
          Open folder
        </a>
      </div>

      <ul v-if="outputs.length > 0" class="output-list">
        <li v-for="item in outputs" :key="item.savedAt">
          <div>
            <strong>{{ item.filename }}</strong>
            <span>{{ item.path }}</span>
          </div>
          <a
            v-if="appContext.mode !== 'local'"
            class="output-link"
            :href="directoryHref(item.path)"
            :target="appContext.navigationTarget"
            rel="noopener noreferrer"
          >
            Open folder
          </a>
        </li>
      </ul>
      <p v-else class="muted">No saved outputs yet.</p>
    </article>

    <article class="card diagnostics">
      <div class="section-head">
        <div>
          <h3>{{ appContext.mode === 'local' ? 'Local runtime targets' : 'Runtime summary' }}</h3>
          <p class="muted">Bridge diagnostics stay visible here without taking over the whole app.</p>
        </div>
      </div>

      <p><strong>Backend mode:</strong> {{ ollama.chatBackend || 'unknown' }}</p>

      <ul v-if="(ollama.targets || []).length > 0" class="target-list">
        <li v-for="item in ollama.targets" :key="item.name">
          <div>
            <strong>{{ item.name }}</strong>
            <span>{{ item.baseUrl }}</span>
          </div>
          <span class="target-state" :class="item.reachable ? 'ok' : 'bad'">
            {{ item.reachable ? `${item.modelCount} models` : 'unreachable' }}
          </span>
        </li>
      </ul>
      <p v-else class="muted">Ollama status not available.</p>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import GatewayStatusCard from '../components/GatewayStatusCard.vue'
import LaunchFullControlButton from '../components/LaunchFullControlButton.vue'
import { api } from '../api'
import { buildFilesAppUrl, resolveAppApiContext } from '../appApi'

const appContext = resolveAppApiContext()
const outputs = ref([])
const preferences = ref({
  advancedModeNewTab: true,
  sessionKey: 'default',
})
const admin = ref({
  outputFolder: 'OpenClaw/Outputs',
})
const ollama = ref({ targets: [] })

const outputFolder = computed(() => admin.value.outputFolder || 'OpenClaw/Outputs')
const outputsFolderHref = computed(() => buildFilesAppUrl(outputFolder.value, appContext))

function appRouteHref(path) {
  const base = appContext.routerBase.endsWith('/') ? appContext.routerBase : `${appContext.routerBase}/`
  return `${base}${String(path || '').replace(/^\/+/, '')}`
}

const shortcuts = computed(() => {
  const items = [
    {
      label: 'Chat workspace',
      href: appRouteHref('/chat'),
      description: 'Continue the current session with the same saved defaults.',
      target: '_self',
    },
    {
      label: 'Preferences',
      href: appRouteHref('/settings'),
      description: 'Adjust per-user behavior without leaving the app.',
      target: '_self',
    },
  ]

  if (appContext.mode !== 'local') {
    items.unshift(
      {
        label: 'Files',
        href: buildFilesAppUrl('', appContext),
        description: 'Launch OpenClaw from file actions and keep your selection attached.',
        target: appContext.navigationTarget,
      },
      {
        label: 'Outputs folder',
        href: outputsFolderHref.value,
        description: 'Jump straight to the folder where saved replies are uploaded.',
        target: appContext.navigationTarget,
      }
    )
  }

  return items
})

function directoryHref(path) {
  const segments = String(path || '')
    .split('/')
    .filter(Boolean)
  const directory = segments.length > 1 ? segments.slice(0, -1).join('/') : outputFolder.value
  return buildFilesAppUrl(directory, appContext)
}

async function load() {
  const [saved, prefs, adminSettings, ollamaStatus] = await Promise.all([
    api.recentOutputs(),
    api.preferences(),
    api.adminSettings().catch(() => ({ outputFolder: 'OpenClaw/Outputs' })),
    api.ollamaStatus().catch(() => ({ targets: [], chatBackend: 'auto' })),
  ])
  outputs.value = saved.items || []
  preferences.value = {
    advancedModeNewTab: true,
    sessionKey: 'default',
    ...prefs,
  }
  admin.value = {
    outputFolder: adminSettings.outputFolder || 'OpenClaw/Outputs',
  }
  ollama.value = ollamaStatus
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
  background: var(--openclaw-panel-strong);
  border: 1px solid var(--openclaw-border);
  border-radius: 20px;
  padding: 1rem 1.1rem;
  box-shadow: 0 16px 30px rgba(18, 33, 50, 0.04);
}

.hero {
  display: grid;
  gap: 1rem;
}

.hero-copy {
  display: grid;
  gap: 0.35rem;
}

.eyebrow {
  margin: 0;
  color: var(--openclaw-accent-strong);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 0;
}

.muted {
  color: var(--openclaw-muted);
}

.hero-copy p {
  margin: 0;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-start;
}

.primary-action,
.secondary-action,
.inline-link,
.output-link,
.shortcut {
  text-decoration: none;
}

.primary-action,
.secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0 1rem;
  border-radius: 999px;
  font-weight: 700;
}

.primary-action {
  background: var(--openclaw-accent);
  color: #fff;
}

.secondary-action,
.inline-link,
.output-link {
  border: 1px solid var(--openclaw-border-strong);
  background: #fff;
  color: var(--openclaw-text);
}

.hero-stats {
  display: grid;
  gap: 0.75rem;
  margin: 0;
}

.hero-stats div,
.shortcut,
.output-list li,
.target-list li {
  border: 1px solid rgba(20, 58, 96, 0.08);
  border-radius: 16px;
  background: rgba(246, 250, 252, 0.85);
}

.hero-stats div {
  padding: 0.9rem;
}

.hero-stats dt {
  color: var(--openclaw-muted);
  font-size: 0.88rem;
}

.hero-stats dd {
  margin: 0.35rem 0 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.95rem;
}

.section-head p {
  margin: 0.35rem 0 0;
}

.shortcut-grid {
  display: grid;
  gap: 0.75rem;
}

.shortcut {
  display: grid;
  gap: 0.2rem;
  padding: 0.9rem;
}

.shortcut span {
  color: var(--openclaw-muted);
}

.output-list,
.target-list {
  display: grid;
  gap: 0.75rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.output-list li,
.target-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.85rem;
  align-items: center;
  padding: 0.9rem;
}

.output-list strong,
.target-list strong {
  display: block;
}

.output-list span,
.target-list span {
  color: var(--openclaw-muted);
}

.inline-link,
.output-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.2rem;
  padding: 0 0.85rem;
  border-radius: 999px;
}

.target-state {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 700;
}

.ok {
  background: rgba(13, 141, 52, 0.08);
  color: #0d8d34;
}

.bad {
  background: rgba(181, 31, 31, 0.08);
  color: #b51f1f;
}

@media (min-width: 900px) {
  .hero-stats,
  .shortcut-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .section-head,
  .output-list li,
  .target-list li {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
