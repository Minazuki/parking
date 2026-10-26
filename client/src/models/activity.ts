import type { Pool, PoolResult } from '../domain/draw.mts'

export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type CurrentStage = -1 | Stage
export type Mode = 'test' | 'live'
export type Category = 'motorcycle' | 'bicycle_large' | 'bicycle_small'
export type Intent = 0 | 1 | 2
export interface Activity {
  schemaVersion: 1
  activityId: string
  activityYear: number
  mode: Mode
  createdAt: string
  createdByAppVersion: string
}
export interface Status {
  version: string
  workspace: string
  currentStage: CurrentStage
  activity: Activity | null
}
export interface Registration {
  household: string
  motorcycle: Intent
  bicycleLarge: Intent
  bicycleSmall: Intent
}
export interface FirstState {
  schemaVersion: 1
  registrations: { A: Registration[]; B: Registration[] }
  accessible: {
    assignments: { order: number; household: string; spaceId: string }[]
    splitSpaces: string[]
    transferredSpaces: string[]
  }
  pools: Pool[]
}
export interface SeedState {
  schemaVersion: 1
  provider: 'drand'
  apiVersion: 'v2'
  chainHash: string
  seed: string
  round: number
  buttonPressedAt: string
  requestStartedAt: string
  responseReceivedAt: string
  roundScheduledTimeUtc: string
  signatureVerified: true
}
export interface AllocationState {
  schemaVersion: 1
  algorithm: string
  nonce: string
  initialCounter: number
  uint32Endian: string
  poolRemoval: string
  status: 'completed' | 'skipped'
  reason: string | null
  streamHex: string
  pools: PoolResult[]
}
export interface PaymentState {
  schemaVersion: 1
  source: { fileName: string; sha256: string; importedAt: string }
  payments: { household: string; motorcycle: boolean; bicycleLarge: boolean; bicycleSmall: boolean }[]
}
export interface ReviewState {
  schemaVersion: 1
  review: {
    category: Category
    retained: { household: string; spaceId: string }[]
    released: { household: string; spaceId: string; reason: string }[]
    vacantSpaces: string[]
  }[]
  pools: Pool[]
  spaceOrigins: { category: Category; spaceId: string; source: string }[]
}
export interface StageTypes {
  0: FirstState; 1: SeedState; 2: AllocationState; 3: PaymentState
  4: ReviewState; 5: SeedState; 6: AllocationState
}
export type Checkpoints = Partial<StageTypes>
export interface Session { status: Status; checkpoints: Checkpoints }
export interface InputIssue { fileName: string; row: number; column: string; message: string }
export type PhaseId = 'registration' | 'first' | 'payments' | 'review' | 'second'
export const phases: { id: PhaseId; label: string; minimum: CurrentStage; completed: Stage }[] = [
  { id: 'registration', label: '登記確認', minimum: -1, completed: 0 },
  { id: 'first', label: '第一輪抽選', minimum: 0, completed: 2 },
  { id: 'payments', label: '繳費匯入', minimum: 2, completed: 3 },
  { id: 'review', label: '清票確認', minimum: 3, completed: 4 },
  { id: 'second', label: '第二輪抽選', minimum: 4, completed: 6 },
]
export function activePhase(stage: CurrentStage): PhaseId {
  if (stage < 0) return 'registration'
  if (stage < 2) return 'first'
  if (stage === 2) return 'payments'
  if (stage === 3) return 'review'
  return 'second'
}
export const poolNames: Record<string, string> = {
  motorcycle_a: 'A棟機車', motorcycle_b: 'B棟機車', motorcycle: '機車（A／B棟）',
  bicycle_large: '大腳踏車', bicycle_small: '小腳踏車',
}
export function intentLabel(value: Intent, bicycle = false): string {
  return value === 0 ? bicycle ? '不參與' : '放棄' : value === 1 ? '一輪' : '兩輪'
}
export function taipeiTime(value: string | Date | null): string {
  if (!value || Number.isNaN(new Date(value).valueOf())) return '—'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(value))
}
