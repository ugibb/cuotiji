import { AbilityReport } from '../../../types/index'
import type { AppGlobal } from '../../../app'

const DEFAULT_REPORT: AbilityReport = {
  level: '初级', levelChar: '初', totalScore: 0,
  levelDesc: '', domains: [], radarPoints: '',
}

function buildAiAdjustReply(report: AbilityReport): string {
  const sorted = [...report.domains].sort((a, b) => a.score - b.score)
  const weakest = sorted[0]
  if (!weakest || weakest.status === 'strong') {
    return '明白了 👍 已记录你的补充，画像会据此微调，计划生成时会纳入。'
  }
  const label = weakest.status === 'weak' ? '待突破' : '有基础待强化'
  return `明白了 👍 会把${weakest.name}调整为「${label}」，计划里会适当减少基础讲解，多安排练习题冲刺。画像已更新。`
}

interface ReportPageData {
  statusBarHeight: number
  headerHeight: number
  report: AbilityReport
  aiOpeningMsg: string
  inputVal: string
  userReply: string
  aiAdjust: string
}

Page<ReportPageData, Record<string, unknown>>({
  data: {
    statusBarHeight: 0,
    headerHeight: 0,
    report: DEFAULT_REPORT,
    aiOpeningMsg: '',
    inputVal: '',
    userReply: '',
    aiAdjust: '',
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync()
    const app = getApp<{ globalData: AppGlobal }>()
    const report = app.globalData.abilityReport ?? DEFAULT_REPORT
    const aiOpeningMsg = app.globalData.aiOpeningMsg ?? ''
    ;(this as { _report?: AbilityReport })._report = report
    this.setData({ statusBarHeight, report, aiOpeningMsg })
    wx.nextTick(() => {
      wx.createSelectorQuery().in(this).select('.page-header').boundingClientRect(rect => {
        if (rect) this.setData({ headerHeight: rect.height })
      }).exec()
    })
  },

  onReady() {
    const report = (this as { _report?: AbilityReport })._report ?? this.data.report
    this.drawRadar(report)
  },

  drawRadar(report?: AbilityReport) {
    const { windowWidth } = wx.getSystemInfoSync()
    const rpx = (v: number) => Math.round(v * windowWidth / 750)
    const size = rpx(600)
    const cx = size / 2
    const cy = size / 2
    const outerR = rpx(170)
    const labelR = rpx(215)
    const levels = 5
    const domains = (report ?? this.data.report).domains
    if (domains.length === 0) return
    const n = domains.length
    const angleOf = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2
    const STATUS_COLOR: Record<string, string> = {
      strong: '#16A34A',
      medium: '#D97706',
      weak: '#DC2626',
    }

    const ctx = wx.createCanvasContext('radarCanvas', this)

    // Grid rings
    for (let lvl = 1; lvl <= levels; lvl++) {
      const r = (outerR * lvl) / levels
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const a = angleOf(i)
        const x = cx + r * Math.cos(a)
        const y = cy + r * Math.sin(a)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.setStrokeStyle(lvl === levels ? '#C7D2FE' : '#E5E7EB')
      ctx.setLineWidth(lvl === levels ? 2 : 1)
      ctx.stroke()
    }

    // Axes
    for (let i = 0; i < n; i++) {
      const a = angleOf(i)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + outerR * Math.cos(a), cy + outerR * Math.sin(a))
      ctx.setStrokeStyle('#E5E7EB')
      ctx.setLineWidth(1)
      ctx.stroke()
    }

    // Data polygon fill
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const a = angleOf(i)
      const r = (domains[i].score / 100) * outerR
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.setFillStyle('rgba(91,95,199,0.18)')
    ctx.fill()
    ctx.setStrokeStyle('#5B5FC7')
    ctx.setLineWidth(rpx(3))
    ctx.stroke()

    // Colored dots
    for (let i = 0; i < n; i++) {
      const a = angleOf(i)
      const r = (domains[i].score / 100) * outerR
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      ctx.beginPath()
      ctx.arc(x, y, rpx(9), 0, Math.PI * 2)
      ctx.setFillStyle(STATUS_COLOR[domains[i].status])
      ctx.fill()
      ctx.setStrokeStyle('#fff')
      ctx.setLineWidth(rpx(3))
      ctx.stroke()
    }

    // Labels
    const fz = rpx(22)
    ctx.setFontSize(fz)
    for (let i = 0; i < n; i++) {
      const a = angleOf(i)
      const cosA = Math.cos(a)
      const sinA = Math.sin(a)
      const lx = cx + labelR * cosA
      const ly = cy + labelR * sinA
      ctx.setTextAlign(
        Math.abs(cosA) < 0.15 ? 'center' : cosA > 0 ? 'left' : 'right',
      )
      ctx.setTextBaseline(
        Math.abs(sinA) < 0.15 ? 'middle' : sinA > 0 ? 'top' : 'bottom',
      )
      ctx.setFillStyle(STATUS_COLOR[domains[i].status])
      ctx.fillText(domains[i].name, lx, ly)
    }

    ctx.draw()
  },

  onBack() {
    wx.navigateBack()
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ inputVal: e.detail.value })
  },

  onSendReply() {
    const reply = this.data.inputVal.trim()
    if (!reply) return
    this.setData({ userReply: reply, inputVal: '' })
    setTimeout(() => {
      this.setData({ aiAdjust: buildAiAdjustReply(this.data.report) })
    }, 800)
  },

  onConfirm() {
    const app = getApp<{ globalData: { abilityReport: AbilityReport | null } }>()
    app.globalData.abilityReport = this.data.report
    wx.navigateTo({ url: '/pages/onboarding/plan/index' })
  },
})
