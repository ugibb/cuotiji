import { UserInfo, Student, SprintPlan } from '../../types/index'
import { studentsApi, sprintApi, reviewStreakApi, analyticsApi } from '../../services/api'
import type { AppGlobal } from '../../app'

function zeroPad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

interface MinePageData {
  statusBarHeight: number
  userInfo: UserInfo | null
  student: Student | null
  loading: boolean
  hasPlan: boolean
  m1Progress: string
  m1Day: number
  m1Pct: number
  streakDays: number
  errorCount: number
  notifyDaily: boolean
  parentBound: boolean
}

Page<MinePageData, Record<string, unknown>>({
  data: {
    statusBarHeight: 0,
    userInfo: null,
    student: null,
    loading: false,
    hasPlan: false,
    m1Progress: '0/21',
    m1Day: 0,
    m1Pct: 0,
    streakDays: 0,
    errorCount: 0,
    notifyDaily: true,
    parentBound: false,
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync()
    const stored = wx.getStorageSync('notify_settings')
    this.setData({
      statusBarHeight,
      notifyDaily: stored?.notifyDaily !== undefined ? stored.notifyDaily : true,
      parentBound: wx.getStorageSync('parent_bound') || false,
    })
  },

  onShow() {
    const app = getApp<{ globalData: AppGlobal }>()
    this.setData({ userInfo: app.globalData.userInfo })
    this.loadAll()
  },

  async loadAll() {
    this.setData({ loading: true })
    try {
      const app = getApp<{ globalData: AppGlobal }>()

      // 加载学生信息
      let student = app.globalData.currentStudent
      if (!student) {
        const res = await studentsApi.list()
        if (res.success && res.data?.students.length) {
          student = res.data.students.find((s: Student) => s.isDefault) || res.data.students[0]
          app.globalData.currentStudent = student
          wx.setStorageSync('currentStudent', student)
        }
      }
      if (student) {
        this.setData({ student })
        await Promise.all([
          this.loadPlanStats(student.id),
          this.loadStreak(student.id),
          this.loadErrorCount(student.id),
        ])
      }
    } catch (err) {
      console.error('mine loadAll error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadPlanStats(studentId: number) {
    try {
      const res = await sprintApi.active(studentId)
      const plans: SprintPlan[] = (res.success && res.data?.plans) ? res.data.plans : []
      const plan = plans[0] || null
      if (!plan) {
        this.setData({ hasPlan: false })
        return
      }
      const startDate = new Date(plan.createdAt)
      startDate.setHours(0, 0, 0, 0)
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      const elapsed = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / 86400000))
      const m1Day = Math.min(21, elapsed + 1)
      const m1Pct = Math.round((m1Day / 21) * 100)
      this.setData({
        hasPlan: true,
        m1Day,
        m1Pct,
        m1Progress: `${m1Day}/21`,
      })
    } catch {
      // 非关键
    }
  },

  async loadStreak(studentId: number) {
    try {
      const res = await reviewStreakApi.get(studentId)
      if (res.success && res.data) {
        this.setData({ streakDays: res.data.streak })
      }
    } catch {
      // 非关键
    }
  },

  async loadErrorCount(studentId: number) {
    try {
      const res = await analyticsApi.weakpoints(studentId, 'all', 1)
      if (res.success && res.data) {
        this.setData({ errorCount: res.data.totalWrong })
      }
    } catch {
      // 非关键
    }
  },

  onGoProject() {
    wx.navigateTo({ url: '/pages/project/index' })
  },

  onToggleNotify(e: WechatMiniprogram.SwitchChange & { currentTarget: { dataset: { key: string } } }) {
    const key = e.currentTarget.dataset.key as 'notifyDaily'
    const val = e.detail.value
    this.setData({ [key]: val })
    const stored = wx.getStorageSync('notify_settings') || {}
    wx.setStorageSync('notify_settings', { ...stored, [key]: val })
  },

  onBindParent() {
    wx.showToast({ title: '功能开发中', icon: 'none' })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号？',
      success: (res) => {
        if (res.confirm) {
          const app = getApp<{ globalData: AppGlobal }>()
          app.globalData.token = null
          app.globalData.userInfo = null
          app.globalData.currentStudent = null
          wx.clearStorageSync()
          wx.reLaunch({ url: '/pages/home/index' })
        }
      }
    })
  },

  _formatDate(d: Date): string {
    return `${d.getFullYear()}-${zeroPad(d.getMonth() + 1)}-${zeroPad(d.getDate())}`
  },
})
