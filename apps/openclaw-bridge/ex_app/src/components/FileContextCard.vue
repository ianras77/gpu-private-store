<template>
  <article class="card">
    <header>
      <div class="title-group">
        <h4>{{ item.name }}</h4>
        <small>#{{ item.fileId }}</small>
      </div>
      <span class="mime-pill">{{ item.mime }}</span>
    </header>

    <p class="path">{{ item.path }}</p>
    <p v-if="item.size !== null" class="meta">{{ item.size }} bytes</p>

    <div v-if="item.content" class="preview">
      <strong>Preview</strong>
      <pre>{{ item.content }}</pre>
    </div>
  </article>
</template>

<script setup>
defineProps({
  item: {
    type: Object,
    required: true,
  },
})
</script>

<style scoped>
.card {
  display: grid;
  gap: 0.75rem;
  background: var(--openclaw-panel-strong);
  border: 1px solid var(--openclaw-border);
  border-radius: 16px;
  padding: 0.9rem;
}

header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}

.title-group {
  display: grid;
  gap: 0.1rem;
}

h4,
.path,
.meta {
  margin: 0;
}

.mime-pill {
  display: inline-flex;
  align-items: center;
  min-height: 1.9rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  background: rgba(10, 127, 99, 0.08);
  color: var(--openclaw-accent-strong);
  font-size: 0.8rem;
  font-weight: 600;
}

.path,
.meta,
.preview strong {
  color: var(--openclaw-muted);
}

.path {
  word-break: break-word;
}

.preview pre {
  max-height: 180px;
  overflow: auto;
  margin: 0.45rem 0 0;
  background: #f4f8fb;
  border-radius: 12px;
  padding: 0.75rem;
}
</style>
