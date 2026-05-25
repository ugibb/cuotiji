import { SprintPlan } from '../../types/index'
import { sprintApi } from '../../services/api'

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
    progressPct: 14,
    m1Completed: 3,
    m1Pct: 14,
    streakDays: 3,
  },

  onLoad() {
    this.loadPlan()
  },

  async loadPlan() {
    const app = getApp<{ globalData: { currentStudent: { id: number } | null; activePlan: SprintPlan | null } }>()
    const studentId = app.globalData.currentStudent?.id
    if (!studentId) return

    try {
      const res = await sprintApi.active(studentId)
      if (res.success && res.data?.plans?.length) {
        const plan = res.data.plans[0]
        this.setData({ plan })
      }
    } catch {
      // Use cached plan if API fails
      const cached = app.globalData.activePlan
      if (cached) this.setData({ plan: cached })
    }
  },

  onRetro() {
    wx.navigateTo({ url: '/pages/retro/index' })
  },
})
