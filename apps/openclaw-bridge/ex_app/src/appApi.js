function ensureLeadingSlash(value) {
  return value.startsWith('/') ? value : `/${value}`
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`
}

function buildPath(segments) {
  if (segments.length === 0) {
    return '/'
  }
  return ensureLeadingSlash(segments.join('/'))
}

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '')
}

function resolveOrigin() {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.location.origin
}

function createContext({ mode, appId, entryId, prefixSegments, routerSegments, apiSegments }) {
  const hostBasePath = buildPath(prefixSegments)

  return {
    mode,
    appId,
    entryId,
    hostOrigin: resolveOrigin(),
    hostBasePath,
    hostBaseUrl: `${resolveOrigin()}${hostBasePath === '/' ? '' : hostBasePath}`,
    routerBase: ensureTrailingSlash(buildPath(routerSegments)),
    apiBase: buildPath(apiSegments),
    navigationTarget: mode === 'embedded' ? '_top' : '_self',
  }
}

function resolveEmbeddedContext(segments) {
  const appsIndex = segments.findIndex((segment, index) => {
    return (
      segment === 'apps' &&
      segments[index + 1] === 'app_api' &&
      segments[index + 2] === 'embedded'
    )
  })

  if (appsIndex === -1) {
    return null
  }

  const appId = segments[appsIndex + 3]
  const entryId = segments[appsIndex + 4]

  if (!appId || !entryId) {
    return null
  }

  const prefixSegments = segments.slice(0, appsIndex)
  return createContext({
    mode: 'embedded',
    appId,
    entryId,
    prefixSegments,
    routerSegments: [...prefixSegments, 'apps', 'app_api', 'embedded', appId, entryId],
    apiSegments: [...prefixSegments, 'apps', 'app_api', 'proxy', appId],
  })
}

function resolveProxyUiContext(segments) {
  const appsIndex = segments.findIndex((segment, index) => {
    return (
      segment === 'apps' &&
      segments[index + 1] === 'app_api' &&
      segments[index + 2] === 'proxy'
    )
  })

  if (appsIndex === -1) {
    return null
  }

  const appId = segments[appsIndex + 3]
  const uiSegment = segments[appsIndex + 4]

  if (!appId || uiSegment !== 'ui') {
    return null
  }

  const prefixSegments = segments.slice(0, appsIndex)
  const proxyBaseSegments = [...prefixSegments, 'apps', 'app_api', 'proxy', appId]

  return createContext({
    mode: 'direct-ui',
    appId,
    entryId: 'ui',
    prefixSegments,
    routerSegments: [...proxyBaseSegments, 'ui'],
    apiSegments: [...proxyBaseSegments, 'api'],
  })
}

function resolveLocalUiContext(segments) {
  const uiIndex = segments.findIndex((segment) => segment === 'ui')
  if (uiIndex === -1) {
    return null
  }

  const prefixSegments = segments.slice(0, uiIndex)
  return createContext({
    mode: 'direct-ui',
    appId: null,
    entryId: 'ui',
    prefixSegments,
    routerSegments: [...prefixSegments, 'ui'],
    apiSegments: [...prefixSegments, 'api'],
  })
}

export function resolveAppApiContext(pathname = typeof window !== 'undefined' ? window.location.pathname : '/') {
  const segments = pathname.split('/').filter(Boolean)

  return (
    resolveEmbeddedContext(segments) ||
    resolveProxyUiContext(segments) ||
    resolveLocalUiContext(segments) || {
      mode: 'local',
      appId: null,
      entryId: 'local',
      hostOrigin: resolveOrigin(),
      hostBasePath: '/',
      hostBaseUrl: resolveOrigin(),
      routerBase: '/',
      apiBase: '/api',
      navigationTarget: '_self',
    }
  )
}

export function buildHostUrl(pathname = '/', context = resolveAppApiContext()) {
  const baseUrl = context.hostBaseUrl || resolveOrigin()
  const normalizedPath = ensureLeadingSlash(trimSlashes(pathname))
  return `${baseUrl}${normalizedPath === '/' ? '/' : normalizedPath}`
}

export function hostAppUrl(appName, suffix = '/', context = resolveAppApiContext()) {
  const normalizedSuffix = trimSlashes(suffix)
  const pathname = normalizedSuffix
    ? `/apps/${trimSlashes(appName)}/${normalizedSuffix}`
    : `/apps/${trimSlashes(appName)}/`
  return buildHostUrl(pathname, context)
}

export function buildFilesAppUrl(directory = '', context = resolveAppApiContext()) {
  const url = new URL(hostAppUrl('files', '/', context))
  const normalizedDirectory = trimSlashes(directory)
  if (normalizedDirectory) {
    url.searchParams.set('dir', ensureLeadingSlash(normalizedDirectory))
  }
  return url.toString()
}

export function describeAppApiMode(context = resolveAppApiContext()) {
  if (context.mode === 'embedded') {
    return 'Embedded in Nextcloud'
  }
  if (context.mode === 'direct-ui') {
    return 'Nextcloud bridge route'
  }
  return 'Local development'
}
