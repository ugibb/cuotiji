import { AbilityReport, DomainScore } from '../../types/index'

const MOCK_REPORT: AbilityReport = {
  level: '中级',
  levelChar: '中',
  totalScore: 67,
  radarPoints: '100,40.5 137.6,78.3 127.3,115.75 100,154.6 57.6,124.5 66.6,80.75',
  domains: [
    { name: '计数原理', score: 85, status: 'strong' },
    { name: '行程问题', score: 62, status: 'medium' },
    { name: '整除余数', score: 45, status: 'weak' },
    { name: '鸡兔同笼', score: 78, status: 'strong' },
    { name: '数列规律', score: 70, status: 'strong' },
    { name: '应用综合', score: 55, status: 'medium' },
  ] as DomainScore[],
}

const AI_ADJUST_REPLY = '明白了 👍 把整除余数调整为「有基础待强化」，计划里会适当减少基础讲解，多安排练习题冲刺。画像已更新。'

interface ReportPageData {
  report: AbilityReport
  inputVal: string
  userReply: string
  aiAdjust: string
}

Page<ReportPageData, Record<string, unknown>>({
  data: {
    report: MOCK_REPORT,
    inputVal: '',
    userReply: '',
    aiAdjust: '',
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ inputVal: e.detail.value })
  },

  onSendReply() {
    const reply = this.data.inputVal.trim()
    if (!reply) return
    this.setData({ userReply: reply, inputVal: '' })
    setTimeout(() => {
      this.setData({ aiAdjust: AI_ADJUST_REPLY })
    }, 800)
  },

  onConfirm() {
    // Store report in globalData for plan-preview
    const app = getApp<{ globalData: { abilityReport: AbilityReport | null } }>()
    app.globalData.abilityReport = this.data.report
    wx.navigateTo({ url: '/pages/plan-preview/index' })
  },
})
