import { resolveAppApiContext } from './appApi'

const { apiBase: API_BASE } = resolveAppApiContext()

function formatErrorMessage(payload, status) {
  if (!payload) {
    return `HTTP ${status}`
  }

  if (typeof payload === 'string') {
    return payload
  }

  if (typeof payload.detail === 'string') {
    return payload.detail
  }

  if (typeof payload.error === 'string') {
    return payload.error
  }

  return `HTTP ${status}`
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const payload = await response.json()
      throw new Error(formatErrorMessage(payload, response.status))
    }

    const text = (await response.text()).trim()
    throw new Error(text || `HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

export const api = {
  me: () => request('/me'),
  gatewayStatus: () => request('/gateway/status'),
  ollamaStatus: () => request('/ollama/status'),
  chatHistory: (sessionKey) => request(`/chat/history?sessionKey=${encodeURIComponent(sessionKey)}`),
  sendChat: (payload) => request('/chat/send', { method: 'POST', body: JSON.stringify(payload) }),
  fileContext: (fileIds, includeContent) => {
    const params = new URLSearchParams()
    if (fileIds.length > 0) {
      params.set('fileIds', fileIds.join(','))
    }
    if (typeof includeContent === 'boolean') {
      params.set('includeContent', String(includeContent))
    }
    return request(`/file-context?${params.toString()}`)
  },
  preferences: () => request('/preferences'),
  savePreferences: (payload) => request('/preferences', { method: 'POST', body: JSON.stringify(payload) }),
  adminSettings: () => request('/admin/settings'),
  saveAdminSettings: (payload) => request('/admin/settings', { method: 'POST', body: JSON.stringify(payload) }),
  openControlUiUrl: () => request('/open-control-ui-url'),
  recentOutputs: () => request('/recent-outputs'),
}
