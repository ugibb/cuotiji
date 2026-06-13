import { AbilityReport } from '../../../types/index'
import type { AppGlobal } from '../../../app'

function buildAiAdjustReply(report: AbilityReport): string {
  const sorted = [...report.domains].sort((a, b) => a.score - b.score)
  const weakest = sorted[0]
  if (!weakest || weakest.status === 'strong') {
    return '明白了 👍 已记录你的补充，画像会据此微调，计划生成时会纳入。'
  }
  const label = weakest.status === 'weak' ? '待突破' : '有基础待强化'
  return `明白了 👍 会把${weakest.name}调整为「${label}」，计划里会适当减少基础讲解，多安排练习题冲刺。画像已更新。`
}

interface ReportChatData {
  statusBarHeight: number
  headerHeight: number
  safeBottom: number
  aiOpeningMsg: string
  userReply: string
  aiAdjust: string
  scrollToId: string
}

Page<ReportChatData, Record<string, unknown>>({
  data: {
    statusBarHeight: 0,
    headerHeight: 0,
    safeBottom: 0,
    aiOpeningMsg: '',
    userReply: '',
    aiAdjust: '',
    scrollToId: '',
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const safeBottom = (sysInfo as { safeAreaInsets?: { bottom?: number } }).safeAreaInsets?.bottom ?? 0
    const app = getApp<{ globalData: AppGlobal }>()
    const aiOpeningMsg = app.globalData.aiOpeningMsg ?? ''
    const userReply = app.globalData.reportChatReply ?? ''
    const aiAdjust = app.globalData.reportChatAiAdjust ?? ''
    this.setData({ statusBarHeight: sysInfo.statusBarHeight, safeBottom, aiOpeningMsg, userReply, aiAdjust })
    wx.nextTick(() => {
      wx.createSelectorQuery().in(this).select('.page-header').boundingClientRect(rect => {
        if (rect) this.setData({ headerHeight: rect.height })
      }).exec()
    })
  },

  onBack() {
    wx.navigateBack()
  },

  onVoiceEnd(e: WechatMiniprogram.CustomEvent<{ filePath: string }>) {
    const app = getApp<{ globalData: { baseUrl: string; token: string | null } }>()
    const token = app.globalData.token || ''
    const chatInput = this.selectComponent('#chat-input-comp') as { fillText: (t: string) => void; resetVoice: (m?: string) => void } | null

    wx.uploadFile({
      url: `${app.globalData.baseUrl}/stt`,
      filePath: e.detail.filePath,
      name: 'audio',
      header: { Authorization: `Bearer ${token}` },
      success: (res) => {
        try {
          const parsed = JSON.parse(res.data) as { success: boolean; data?: { text: string }; error?: string }
          if (parsed.success && parsed.data?.text) {
            chatInput?.fillText(parsed.data.text)
          } else {
            chatInput?.resetVoice(parsed.error || '识别失败，请重试')
          }
        } catch {
          chatInput?.resetVoice('识别失败，请重试')
        }
      },
      fail: () => {
        chatInput?.resetVoice('网络异常，请重试')
      },
    })
  },

  onChatSend(e: WechatMiniprogram.CustomEvent<{ type: 'text' | 'voice'; content?: string }>) {
    if (e.detail.type !== 'text' || !e.detail.content) return
    const reply = e.detail.content.trim()
    if (!reply) return
    const app = getApp<{ globalData: AppGlobal }>()
    this.setData({ userReply: reply, scrollToId: 'msg-bottom' })
    setTimeout(() => {
      const report = app.globalData.abilityReport ?? { level: '初级' as const, levelChar: '初', totalScore: 0, levelDesc: '', domains: [], radarPoints: '' }
      const aiAdjust = buildAiAdjustReply(report)
      app.globalData.reportChatReply = reply
      app.globalData.reportChatAiAdjust = aiAdjust
      this.setData({ aiAdjust, scrollToId: 'msg-bottom' })
    }, 800)
  },
})
