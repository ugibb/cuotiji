import { Problem } from '../../../types/index'
import { assignmentsApi } from '../../../services/api'

interface ReviewDonePageData {
  assignmentId: number
  wrongCount: number
  unknownCount: number
  weakTopic: string
  statusBarHeight: number
  safeAreaBottom: number
}

function deriveWeakTopic(problems: Problem[]): string {
  const freq = new Map<string, number>()
  for (const p of problems) {
    if (p.result !== 'correct' && p.knowledgePoint) {
      freq.set(p.knowledgePoint, (freq.get(p.knowledgePoint) ?? 0) + 1)
    }
  }
  let max = 0
  let topic = ''
  freq.forEach((count, kp) => {
    if (count > max) { max = count; topic = kp }
  })
  return topic
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Page<ReviewDonePageData, any>({
  data: {
    assignmentId: 0,
    wrongCount: 0,
    unknownCount: 0,
    weakTopic: '',
    statusBarHeight: 44,
    safeAreaBottom: 34
  },

  onLoad(options: Record<string, string | undefined>) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 44,
      safeAreaBottom: (sysInfo as { safeAreaInsets?: { bottom?: number } }).safeAreaInsets?.bottom ?? 34,
      assignmentId: Number(options?.assignmentId || 0)
    })
    this.loadSummary()
  },

  async loadSummary() {
    const { assignmentId } = this.data
    if (!assignmentId) return
    try {
      const res = await assignmentsApi.get(assignmentId)
      if (res.success && res.data) {
        const { wrongCount, unknownCount, problems } = res.data
        const weakTopic = deriveWeakTopic(problems ?? [])
        this.setData({ wrongCount, unknownCount, weakTopic })
      }
    } catch (err) {
      console.error('loadSummary error:', err)
    }
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/home/index' })
  }
})
