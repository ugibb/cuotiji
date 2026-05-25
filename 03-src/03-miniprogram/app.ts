import { UserInfo, Student, IntakeAnswers, AbilityReport, ActiveSprintPlan } from './types/index'

interface AppGlobal {
  token: string | null
  userInfo: UserInfo | null
  currentStudent: Student | null
  currentAssignment: {
    id: number | null
    chapterId: number | null
    planDate: string | null
    problems: import('./types/index').Problem[]
  }
  baseUrl: string
  // Onboarding flow state
  intakeAnswers: IntakeAnswers | null
  assessmentAnswers: Record<number, string>
  abilityReport: AbilityReport | null
  activePlan: ActiveSprintPlan | null
}

// Extend the App instance type to carry our globalData shape
const app = {
  globalData: {
    token: null as string | null,
    userInfo: null as UserInfo | null,
    currentStudent: null as Student | null,
    currentAssignment: {
      id: null as number | null,
      chapterId: null as number | null,
      planDate: null as string | null,
      problems: [] as import('./types/index').Problem[]
    },
    baseUrl: 'http://127.0.0.1:3001/api',
    intakeAnswers: null as IntakeAnswers | null,
    assessmentAnswers: {} as Record<number, string>,
    abilityReport: null as AbilityReport | null,
    activePlan: null as ActiveSprintPlan | null,
  } as AppGlobal,

  onLaunch(this: WechatMiniprogram.App.Instance<AppGlobal> & { globalData: AppGlobal; doLogin: () => void; exchangeToken: (code: string) => void }) {
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
    }

    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
    }
    const currentStudent = wx.getStorageSync('currentStudent')
    if (currentStudent) {
      this.globalData.currentStudent = currentStudent
    }

    // 兼容老缓存：历史版本没有 currentStudent，需要重新登录同步学生信息
    if (!this.globalData.token || !this.globalData.currentStudent) {
      this.doLogin()
    }
  },

  doLogin(this: { globalData: AppGlobal; exchangeToken: (code: string) => void }) {
    wx.login({
      success: (res) => {
        if (res.code) {
          this.exchangeToken(res.code)
        }
      },
      fail: (err) => {
        console.error('wx.login failed:', err)
      }
    })
  },

  exchangeToken(this: { globalData: AppGlobal }, code: string) {
    const baseUrl = this.globalData.baseUrl
    wx.request({
      url: `${baseUrl}/auth/login`,
      method: 'POST',
      data: { code },
      header: { 'Content-Type': 'application/json' },
      success: (res: WechatMiniprogram.RequestSuccessCallbackResult) => {
        const body = res.data as {
          success: boolean
          data: { token: string; user: UserInfo; student: Student | null }
          error: string | null
        }
        if (body.success && body.data) {
          this.globalData.token = body.data.token
          this.globalData.userInfo = body.data.user
          this.globalData.currentStudent = body.data.student
          wx.setStorageSync('token', body.data.token)
          wx.setStorageSync('userInfo', body.data.user)
          wx.setStorageSync('currentStudent', body.data.student)
        }
      },
      fail: (err) => {
        console.error('login request failed:', err)
      }
    })
  }
}

App(app)
export type { AppGlobal }
