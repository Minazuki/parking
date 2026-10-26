import type { CurrentStage, InputIssue, Mode, Stage, StageTypes, Status } from '../models/activity.ts'

export class ApiError extends Error {
  readonly status: number
  readonly issues: InputIssue[]
  constructor(message: string, status: number, issues: InputIssue[] = []) { super(message); this.status = status; this.issues = issues }
}
export interface ActivityApi {
  status(): Promise<Status>
  stage<K extends Stage>(number: K): Promise<StageTypes[K]>
  initialize(year: number, mode: Mode): Promise<void>
  importRegistration(): Promise<void>
  importPayments(): Promise<void>
  review(): Promise<void>
  draw(round: 1 | 2, buttonPressedAt?: string): Promise<void>
}

// All writes are explicit commands. Transport failures are never automatically retried.
export function createActivityApi(fetcher: typeof fetch = (...args) => fetch(...args)): ActivityApi {
  async function request(path: string, data?: object, method = 'GET'): Promise<unknown> {
    const response = await fetcher(`/api/v1${path}`, {
      method, cache: 'no-store',
      ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    })
    let value: unknown
    try { value = await response.json() } catch { throw new ApiError('服務回應不是有效的JSON，請確認本機程式仍在執行。', response.status) }
    if (!response.ok) {
      const error = value as { error?: unknown; issues?: InputIssue[] }
      throw new ApiError(typeof error?.error === 'string' ? error.error : `本機服務回應 ${response.status}`, response.status, Array.isArray(error?.issues) ? error.issues : [])
    }
    return value
  }
  return {
    async status() {
      const value = await request('/status') as Partial<Status> | null
      if (!value || typeof value.workspace !== 'string' || typeof value.version !== 'string' || !Number.isInteger(value.currentStage) || value.currentStage! < -1 || value.currentStage! > 6) {
        throw new ApiError('無法辨識目前活動狀態，請確認前後端版本。', 0)
      }
      return value as Status
    },
    async stage<K extends Stage>(number: K) {
      const value = await request(`/stages/${number}`) as { schemaVersion?: unknown } | null
      if (!value || value.schemaVersion !== 1) throw new ApiError('無法辨識存檔格式，請確認前後端版本。', 0)
      return value as StageTypes[K]
    },
    async initialize(activityYear, mode) { await request('/activities', { activityYear, mode }, 'POST') },
    async importRegistration() { await request('/csv-imports/registration', undefined, 'POST') },
    async importPayments() { await request('/csv-imports/payments', undefined, 'POST') },
    async review() { await request('/payment-reviews', undefined, 'POST') },
    async draw(round, buttonPressedAt) { await request(`/rounds/${round}/draws`, buttonPressedAt ? { buttonPressedAt } : undefined, 'POST') },
  }
}
export function isCurrentStage(value: number): value is CurrentStage { return Number.isInteger(value) && value >= -1 && value <= 6 }
