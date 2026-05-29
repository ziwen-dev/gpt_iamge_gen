from pathlib import Path

fragment = Path("frontend/_body_fragment.html").read_text(encoding="utf-8").strip()
# Vue: self-close void tags where needed (img already ok)

header = """<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { initStudio, disposeStudio } from "./studio";

onMounted(() => initStudio());
onUnmounted(() => disposeStudio());
</script>

<template>
"""

footer = """
</template>
"""

Path("frontend/src/App.vue").write_text(header + fragment + footer, encoding="utf-8")
print("wrote App.vue", len(fragment))
