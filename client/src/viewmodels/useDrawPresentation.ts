import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
export const presentationSteps = [
  { id: 'households', label: '戶別名單' }, { id: 'pool', label: '車位池' },
  { id: 'seed', label: '公開種子' }, { id: 'arrival', label: '進場演出' }, { id: 'results', label: '結果總覽' },
] as const
export function useDrawPresentation(poolId: Ref<string>, hasResult: Ref<boolean>, busy: Ref<boolean>) {
  const index = ref(0)
  const step = computed(() => presentationSteps[index.value]!)
  const canNext = computed(() => !busy.value && index.value < presentationSteps.length - 1 && (index.value !== 2 || hasResult.value))
  function next() { if (canNext.value) index.value++ }
  function previous() { if (!busy.value && index.value > 0) index.value-- }
  watch(poolId, () => { index.value = 0 })
  return { index, step, canNext, next, previous }
}
