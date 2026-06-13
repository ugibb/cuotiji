import { api } from '../../../services/api'

interface WeakPoint {
  chapterId: number
  chapterName: string
  chapterCode: string
  totalWrong: number
  recentWrong: number
  weaknessScore: number
  lastWrongDate: string
}

interface AnalysisPageData {
  weakpoints: WeakPoint[]
  totalWrong: number
  hasEnoughData: boolean
  loading: boolean
  timeRange: 'all' | 'week' | 'month'
  studentId: number | null
  maxScore: number
  statusBarHeight: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Page<AnalysisPageData, any>({
  data: {
    weakpoints: [],
    totalWrong: 0,
    hasEnoughData: false,
    loading: false,
    timeRange: 'all',
    studentId: null,
    maxScore: 1,
    statusBarHeight: 44,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44 })

    const app = getApp<{ globalData: { currentStudent: { id: number } | null } }>()
    const currentStudent = app.globalData.currentStudent
    if (currentStudent) {
      this.setData({ studentId: currentStudent.id })
    }
    this.loadWeakpoints()
  },

  onShow() {
    this.loadWeakpoints()
  },

  onBack() {
    wx.navigateBack()
  },

  async loadWeakpoints() {
    const { studentId, timeRange } = this.data
    if (!studentId) return

    this.setData({ loading: true })
    try {
      const res = await api.get<{
        weakpoints: WeakPoint[]
        totalWrong: number
        hasEnoughData: boolean
      }>('/analytics/weakpoints', { studentId, timeRange, limit: 5 })

      if (res.success && res.data) {
        const { weakpoints, totalWrong, hasEnoughData } = res.data
        const maxScore = weakpoints.length > 0 ? weakpoints[0].weaknessScore : 1
        this.setData({ weakpoints, totalWrong, hasEnoughData, maxScore })
      }
    } catch (err) {
      console.error('loadWeakpoints error:', err)
      wx.showToast({ title: '加载失败', icon: 'error' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onTimeRangeChange(e: WechatMiniprogram.BaseEvent) {
    const dataset = e.currentTarget.dataset as { range?: string }
    const timeRange = (dataset.range || 'all') as AnalysisPageData['timeRange']
    this.setData({ timeRange })
    this.loadWeakpoints()
  },

  onChapterTap(e: WechatMiniprogram.BaseEvent) {
    const { studentId } = this.data
    const dataset = e.currentTarget.dataset as { chapterId?: string }
    const chapterId = dataset.chapterId
    if (chapterId && studentId) {
      wx.navigateTo({
        url: `/pages/project/problem-list/index?chapterId=${chapterId}&studentId=${studentId}`
      })
    }
  }
})
