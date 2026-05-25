import { IntakeAnswers } from '../../types/index'

interface IntakePageData {
  q1: string
  q2: string
  q3: string
  q4: string
  canNext: boolean
}

Page<IntakePageData, Record<string, unknown>>({
  data: {
    q1: '',
    q2: '',
    q3: '',
    q4: '',
    canNext: false,
  },

  onPick(e: WechatMiniprogram.BaseEvent) {
    const { q, val } = e.currentTarget.dataset as { q: string; val: string }
    const update: Record<string, string> = { [q]: val }
    this.setData(update)
    const { q1, q2, q3, q4 } = { ...this.data, ...update }
    this.setData({ canNext: !!(q1 && q2 && q3 && q4) })
  },

  onNext() {
    if (!this.data.canNext) return
    const { q1, q2, q3, q4 } = this.data
    const answers: IntakeAnswers = {
      experience: q1 as IntakeAnswers['experience'],
      hardestTopic: q2 as IntakeAnswers['hardestTopic'],
      weeklyHours: q3 as IntakeAnswers['weeklyHours'],
      confidence: q4 as IntakeAnswers['confidence'],
    }
    // Store in globalData for use in assessment/report
    const app = getApp<{ globalData: { intakeAnswers: IntakeAnswers | null } }>()
    app.globalData.intakeAnswers = answers
    wx.navigateTo({ url: '/pages/assessment/index' })
  },
})
