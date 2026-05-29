import { Assignment, Problem } from '../../../types/index'
import { assignmentsApi } from '../../../services/api'

interface KnowledgeTag {
  label: string
  status: 'mastered' | 'struggling' | 'unknown'
  suffix: string
}

interface SummaryPageData {
  assignment: Assignment | null
  chapterName: string
  knowledgeTags: KnowledgeTag[]
  loading: boolean
  statusBarHeight: number
  safeAreaBottom: number
}

function buildKnowledgeTags(problems: Problem[]): KnowledgeTag[] {
  const map = new Map<string, { correct: number; wrong: number; unknown: number }>()

  for (const p of problems) {
    const kp = p.knowledgePoint
    if (!kp) continue
    if (!map.has(kp)) map.set(kp, { correct: 0, wrong: 0, unknown: 0 })
    const entry = map.get(kp)!
    if (p.result === 'correct') entry.correct++
    else if (p.result === 'wrong') entry.wrong++
    else entry.unknown++
  }

  return Array.from(map.entries()).map(([label, counts]) => {
    if (counts.wrong > 0) return { label, status: 'struggling' as const, suffix: '× 待突破' }
    if (counts.unknown > 0) return { label, status: 'unknown' as const, suffix: '? 待分析' }
    return { label, status: 'mastered' as const, suffix: '✓' }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Page<SummaryPageData, any>({
  data: {
    assignment: null,
    chapterName: '',
    knowledgeTags: [],
    loading: true,
    statusBarHeight: 44,
    safeAreaBottom: 34
  },

  onLoad(options: Record<string, string | undefined>) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const statusBarHeight = sysInfo.statusBarHeight || 44
    const safeAreaBottom = (sysInfo as { safeAreaInsets?: { bottom?: number } }).safeAreaInsets?.bottom ?? 34
    const chapterName = decodeURIComponent(options?.chapterName || '')
    this.setData({ statusBarHeight, safeAreaBottom, chapterName })

    const assignmentId = Number(options?.assignmentId || 0)
    if (assignmentId) this.loadAssignment(assignmentId)
  },

  async loadAssignment(id: number) {
    this.setData({ loading: true })
    try {
      const res = await assignmentsApi.get(id)
      if (res.success && res.data) {
        const knowledgeTags = buildKnowledgeTags(res.data.problems ?? [])
        this.setData({ assignment: res.data, knowledgeTags })
      }
    } catch (err) {
      console.error('loadAssignment error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  onViewProblems() {
    const { assignment } = this.data
    if (assignment) {
      wx.navigateTo({ url: `/pages/checkin/problem-list/index?assignmentId=${assignment.id}` })
    }
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/home/index' })
  }
})
