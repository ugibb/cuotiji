import { AssessmentQuestion, AbilityReport } from '../../../types/index'
import { intakeApi } from '../../../services/api'
import type { AppGlobal } from '../../../app'

interface AssessmentPageData {
  statusBarHeight: number
  headerHeight: number
  questions: AssessmentQuestion[]
  answers: Record<number, string>
  answered: number
  total: number
  submitting: boolean
  loading: boolean
}

Page<AssessmentPageData, Record<string, unknown>>({
  data: {
    statusBarHeight: 0,
    headerHeight: 0,
    questions: [],
    answers: {},
    answered: 0,
    total: 0,
    submitting: false,
    loading: true,
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync()
    this.setData({ statusBarHeight })
    wx.nextTick(() => {
      wx.createSelectorQuery().in(this).select('.page-header').boundingClientRect(rect => {
        if (rect) this.setData({ headerHeight: rect.height })
      }).exec()
    })
    this.loadQuestions()
  },

  async loadQuestions() {
    try {
      wx.showLoading({ title: '加载题目...' })
      const res = await intakeApi.questions()
      if (res.success && res.data?.questions) {
        const questions = res.data.questions
        this.setData({ questions, total: questions.length, loading: false })
      } else {
        wx.showToast({ title: '加载题目失败', icon: 'error' })
      }
    } catch {
      wx.showToast({ title: '网络错误，请重试', icon: 'error' })
    } finally {
      wx.hideLoading()
    }
  },

  onBack() {
    wx.navigateBack()
  },

  onPick(e: WechatMiniprogram.BaseEvent) {
    const { qid, label } = e.currentTarget.dataset as { qid: number; label: string }
    const answers = { ...this.data.answers, [qid]: label }
    const answered = Object.keys(answers).length
    this.setData({ answers, answered })
  },

  async onSubmit() {
    if (this.data.answered < this.data.total || this.data.submitting) return
    this.setData({ submitting: true })

    const app = getApp<{ globalData: AppGlobal }>()
    const studentId = app.globalData.currentStudent?.id

    if (!studentId) {
      wx.showToast({ title: '请先登录', icon: 'error' })
      this.setData({ submitting: false })
      return
    }

    try {
      wx.showLoading({ title: 'AI 正在分析…' })
      // 转为 string key map 再发送（JSON 序列化后数字键也是字符串，此处显式转换）
      const answers: Record<string, string> = {}
      for (const [k, v] of Object.entries(this.data.answers)) {
        answers[String(k)] = v as string
      }

      const res = await intakeApi.submit(studentId, answers)
      wx.hideLoading()

      if (res.success && res.data) {
        const { report, aiOpeningMsg } = res.data
        app.globalData.abilityReport = report as AbilityReport
        app.globalData.aiOpeningMsg = aiOpeningMsg
        app.globalData.assessmentAnswers = this.data.answers
        wx.navigateTo({ url: '/pages/onboarding/report/index' })
      } else {
        wx.showToast({ title: res.error || '提交失败', icon: 'error' })
      }
    } catch {
      wx.hideLoading()
      wx.showToast({ title: '网络错误，请重试', icon: 'error' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
