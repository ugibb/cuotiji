import { sprintApi } from '../../services/api'

interface PlanInfo {
  totalDays: number
}

interface PlanPreviewPageData {
  plan: PlanInfo
  saving: boolean
}

Page<PlanPreviewPageData, Record<string, unknown>>({
  data: {
    plan: { totalDays: 67 },
    saving: false,
  },

  async onConfirm() {
    if (this.data.saving) return
    this.setData({ saving: true })

    const app = getApp<{
      globalData: {
        currentStudent: { id: number } | null
        activePlan: import('../../types/index').SprintPlan | null
      }
    }>()
    const studentId = app.globalData.currentStudent?.id

    if (!studentId) {
      wx.showToast({ title: '请先登录', icon: 'error' })
      this.setData({ saving: false })
      return
    }

    try {
      const res = await sprintApi.create({
        studentId,
        subject: '华杯小学数学邀请赛',
        examDate: '2026-11-20',
      })
      if (res.success && res.data) {
        app.globalData.activePlan = res.data
        wx.setStorageSync('activePlan', res.data)
      }
    } catch {
      // Continue even if API fails; plan data is local
    }

    this.setData({ saving: false })
    // Navigate to home and clear the onboarding stack
    wx.reLaunch({ url: '/pages/home/index' })
  },
})
