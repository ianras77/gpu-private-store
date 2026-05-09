import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import ChatView from './views/ChatView.vue'
import FileActionView from './views/FileActionView.vue'
import SettingsView from './views/SettingsView.vue'
import { resolveAppApiContext } from './appApi'

const router = createRouter({
  history: createWebHistory(resolveAppApiContext().routerBase),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: {
        title: 'Workspace',
        description: 'Start from Files, continue sessions, and save output back into Nextcloud.',
      },
    },
    {
      path: '/chat',
      name: 'chat',
      component: ChatView,
      meta: {
        title: 'Chat',
        description: 'Work with file-aware prompts that stay anchored to the signed-in Nextcloud user.',
      },
    },
    {
      path: '/file-action',
      name: 'file-action',
      component: FileActionView,
      meta: {
        title: 'Files Action',
        description: 'This view was launched from Nextcloud Files with selected documents already attached.',
        compactShell: true,
      },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: {
        title: 'Preferences',
        description: 'Adjust your OpenClaw defaults while operators manage bridge settings in Nextcloud.',
      },
    },
  ],
})

export default router
