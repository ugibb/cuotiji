import { SprintPlan } from '../../types/index'
import { sprintApi, reviewStreakApi } from '../../services/api'

interface ProjectPageData {
  plan: Partial<SprintPlan>
  progressPct: number
  m1Completed: number
  m1Pct: number
  streakDays: number
}

Page<ProjectPageData, Record<string, unknown>>({
  data: {
    plan: { daysLeft: 0 },
    progressPct: 0,
    m1Completed: 0,
    m1Pct: 0,
    streakDays: 0,
  },

  onLoad() {
    this.loadPlan()
  },

  async loadPlan() {
    const app = getApp<{ globalData: { currentStudent: { id: number } | null; activePlan: SprintPlan | null } }>()
    const studentId = app.globalData.currentStudent?.id
    if (!studentId) return

    try {
      const [sprintRes, streakRes] = await Promise.all([
        sprintApi.active(studentId),
        reviewStreakApi.get(studentId),
      ])

      if (sprintRes.success && sprintRes.data?.plans?.length) {
        const plan = sprintRes.data.plans[0]
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const startDate = new Date(plan.createdAt)
        startDate.setHours(0, 0, 0, 0)
        const elapsed = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / 86400000))
        const m1Completed = Math.min(21, elapsed + 1)
        const m1Pct = Math.round((m1Completed / 21) * 100)
        const totalDays = 67
        const progressPct = Math.round((elapsed / totalDays) * 100)
        const streakDays = (streakRes.success && streakRes.data?.streak) ? streakRes.data.streak : 0

        this.setData({ plan, m1Completed, m1Pct, progressPct, streakDays })
      }
    } catch {
      const cached = app.globalData.activePlan
      if (cached) this.setData({ plan: cached })
    }
  },

  onRetro() {
    wx.navigateTo({ url: '/pages/project/retro/index' })
  },
})
