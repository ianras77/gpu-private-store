<template>
  <div class="app-shell" :class="{ embedded: appContext.mode === 'embedded', compact: route.meta.compactShell }">
    <section class="app-frame">
      <header class="shell-header">
        <div class="headline">
          <p class="eyebrow">{{ route.meta.compactShell ? 'Sent from Nextcloud Files' : 'OpenClaw Workspace' }}</p>
          <h1>{{ route.meta.title || 'OpenClaw' }}</h1>
          <p class="summary">{{ route.meta.description || routeMode }}</p>
        </div>

        <div class="header-actions">
          <a
            v-if="showHostFilesLink"
            class="host-link"
            :href="filesHref"
            :target="appContext.navigationTarget"
            rel="noopener noreferrer"
          >
            Back to Files
          </a>
          <div class="identity-card">
            <strong>{{ profile.displayName || profile.id || 'Nextcloud user' }}</strong>
            <span>{{ routeMode }}</span>
          </div>
        </div>
      </header>

      <nav v-if="showTabs" class="section-tabs" aria-label="OpenClaw sections">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to">
          {{ item.label }}
        </RouterLink>
      </nav>

      <main class="shell-main">
        <RouterView />
      </main>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from './api'
import { describeAppApiMode, hostAppUrl, resolveAppApiContext } from './appApi'

const route = useRoute()
const appContext = resolveAppApiContext()
const profile = ref({})

const routeMode = describeAppApiMode(appContext)
const navItems = [
  { label: 'Workspace', to: '/' },
  { label: 'Chat', to: '/chat' },
  { label: 'Preferences', to: '/settings' },
]

const filesHref = hostAppUrl('files', '/', appContext)
const showTabs = computed(() => !route.meta.compactShell)
const showHostFilesLink = computed(() => appContext.mode !== 'local')

async function loadProfile() {
  try {
    const payload = await api.me()
    profile.value = payload.user || {}
  } catch (err) {
    profile.value = {}
  }
}

onMounted(() => {
  void loadProfile()
})
</script>

<style scoped>
.app-shell {
  --openclaw-bg: linear-gradient(180deg, #f6f8fa 0%, #eef3f9 100%);
  --openclaw-panel: rgba(255, 255, 255, 0.92);
  --openclaw-panel-strong: #ffffff;
  --openclaw-border: rgba(20, 58, 96, 0.12);
  --openclaw-border-strong: rgba(20, 58, 96, 0.2);
  --openclaw-text: #16202a;
  --openclaw-muted: #5d6c7b;
  --openclaw-accent: #0a7f63;
  --openclaw-accent-strong: #075e4a;
  --openclaw-warning: #fff4da;
  min-height: 100vh;
  color: var(--openclaw-text);
  background: var(--openclaw-bg);
}

.app-frame {
  max-width: 1120px;
  margin: 0 auto;
  padding: 1rem;
}

.embedded .app-frame {
  max-width: 1180px;
  padding-top: 0.7rem;
}

.compact .app-frame {
  max-width: 1220px;
}

.shell-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--openclaw-border);
  border-radius: 20px;
  background: var(--openclaw-panel);
  box-shadow: 0 18px 40px rgba(18, 33, 50, 0.06);
}

.headline {
  display: grid;
  gap: 0.3rem;
}

.eyebrow {
  margin: 0;
  color: var(--openclaw-accent-strong);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.shell-header h1 {
  margin: 0;
  font-size: clamp(1.4rem, 2.5vw, 2rem);
  line-height: 1.05;
}

.summary {
  margin: 0;
  max-width: 56rem;
  color: var(--openclaw-muted);
}

.header-actions {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.host-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.5rem;
  padding: 0 1rem;
  border: 1px solid var(--openclaw-border-strong);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--openclaw-text);
  font-weight: 600;
  text-decoration: none;
}

.identity-card {
  display: grid;
  gap: 0.15rem;
  min-width: 11rem;
  padding: 0.75rem 0.9rem;
  border-radius: 16px;
  border: 1px solid var(--openclaw-border);
  background: rgba(246, 250, 252, 0.9);
  text-align: left;
}

.identity-card span {
  color: var(--openclaw-muted);
  font-size: 0.85rem;
}

.section-tabs {
  display: flex;
  gap: 0.55rem;
  flex-wrap: wrap;
  padding: 0.8rem 0.15rem 0;
}

.section-tabs a {
  display: inline-flex;
  align-items: center;
  min-height: 2.35rem;
  padding: 0 0.95rem;
  border-radius: 999px;
  border: 1px solid transparent;
  color: var(--openclaw-muted);
  font-weight: 600;
  text-decoration: none;
}

.section-tabs a.router-link-active {
  color: var(--openclaw-accent-strong);
  background: rgba(10, 127, 99, 0.08);
  border-color: rgba(10, 127, 99, 0.16);
}

.shell-main {
  padding-top: 0.9rem;
}

@media (max-width: 760px) {
  .app-frame {
    padding: 0.75rem;
  }

  .shell-header {
    flex-direction: column;
  }

  .header-actions {
    justify-content: flex-start;
  }
}
</style>
