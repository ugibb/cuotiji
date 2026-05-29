import { api } from '../../../services/api'
import { ReviewProblem } from '../../../types/index'

interface ReviewPageData {
  problems: ReviewProblem[]
  current: number
  flipped: boolean
  loading: boolean
  marking: boolean
  allDone: boolean
  checkedInToday: boolean
  studentId: number | null
  streak: number
  statusBarHeight: number
  safeAreaBottom: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Page<ReviewPageData, any>({
  data: {
    problems: [],
    current: 0,
    flipped: false,
    loading: true,
    marking: false,
    allDone: false,
    checkedInToday: false,
    studentId: null,
    streak: 0,
    statusBarHeight: 44,
    safeAreaBottom: 34,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const safeAreaBottom = (sysInfo as { safeAreaInsets?: { bottom?: number } }).safeAreaInsets?.bottom ?? 34
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44, safeAreaBottom })

    const app = getApp<{ globalData: { currentStudent: { id: number } | null } }>()
    const currentStudent = app.globalData.currentStudent
    if (currentStudent) {
      this.setData({ studentId: currentStudent.id })
    }
    this.loadDailyProblems()
  },

  onBack() {
    wx.navigateBack()
  },

  async loadDailyProblems() {
    const { studentId } = this.data
    if (!studentId) return

    this.setData({ loading: true })
    try {
      const res = await api.get<{ problems: ReviewProblem[]; checkedInToday: boolean }>(
        '/review/daily',
        { studentId }
      )
      if (res.success && res.data) {
        const { problems, checkedInToday } = res.data
        if (problems.length === 0) {
          this.setData({ allDone: true, checkedInToday })
        } else {
          this.setData({ problems, checkedInToday })
        }
      }
    } catch (err) {
      console.error('loadDailyProblems error:', err)
      wx.showToast({ title: '加载失败', icon: 'error' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onFlipCard() {
    this.setData({ flipped: !this.data.flipped })
  },

  async onMark(mastered: boolean) {
    const { problems, current, studentId } = this.data
    if (this.data.marking) return

    const problem = problems[current]
    if (!problem) return

    this.setData({ marking: true })
    try {
      await api.post(`/review/problems/${problem.id}/mark`, { mastered })
    } catch (err) {
      console.error('mark error:', err)
    } finally {
      this.setData({ marking: false })
    }

    const next = current + 1
    if (next >= problems.length) {
      const checkedRes = await api.get<{ checkedInToday: boolean }>('/review/daily', { studentId })
      this.setData({
        allDone: true,
        checkedInToday: checkedRes.data?.checkedInToday ?? false
      })
    } else {
      this.setData({ current: next, flipped: false })
    }
  },

  onMastered() { this.onMark(true) },
  onNeedsPractice() { this.onMark(false) },

  async onCheckIn() {
    const { studentId } = this.data
    if (!studentId) return

    try {
      const res = await api.post<{ streak: number; alreadyCheckedIn: boolean }>(
        '/review/checkin',
        { studentId }
      )
      if (res.success && res.data) {
        const { streak } = res.data
        this.setData({ checkedInToday: true, streak })
        wx.showToast({ title: `打卡成功！连击 ${streak} 天 🎉`, icon: 'none', duration: 2000 })
      }
    } catch (err) {
      console.error('checkIn error:', err)
      wx.showToast({ title: '打卡失败', icon: 'error' })
    }
  }
})
