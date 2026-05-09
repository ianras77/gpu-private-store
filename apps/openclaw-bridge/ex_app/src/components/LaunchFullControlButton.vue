<template>
  <div class="launch-wrap">
    <button class="launch" @click="launch" :disabled="loading">
      {{ loading ? 'Opening...' : 'Open full OpenClaw' }}
    </button>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../api'
import { resolveAppApiContext } from '../appApi'

const props = defineProps({
  newTab: {
    type: Boolean,
    default: true,
  },
})

const appContext = resolveAppApiContext()
const loading = ref(false)
const error = ref('')

async function launch() {
  loading.value = true
  error.value = ''
  try {
    const payload = await api.openControlUiUrl()
    if (!payload?.available || !payload?.url) {
      throw new Error(payload?.message || 'The control UI URL is not configured yet.')
    }

    if (props.newTab) {
      const opened = window.open(payload.url, '_blank', 'noopener,noreferrer')
      if (!opened) {
        throw new Error('The browser blocked the popup. Allow popups for Nextcloud and try again.')
      }
      return
    }

    if (appContext.navigationTarget === '_top' && window.top) {
      window.top.location.assign(payload.url)
      return
    }

    window.location.assign(payload.url)
  } catch (err) {
    error.value = err.message || 'Unable to open the full OpenClaw UI.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.launch-wrap {
  display: grid;
  gap: 0.45rem;
}

.launch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0 1rem;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #d65f2f 0%, #b24a22 100%);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.error {
  color: #b72121;
  margin: 0;
}
</style>
