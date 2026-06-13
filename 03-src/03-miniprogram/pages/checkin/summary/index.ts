import { Assignment, Problem } from '../../../types/index'
import { assignmentsApi } from '../../../services/api'
import type { AppGlobal } from '../../../app'

interface KnowledgeTag {
  label: string
  status: 'mastered' | 'struggling' | 'unknown'
  suffix: string
}

interface SummaryPageData {
  assignment: Assignment | null
  chapterName: string
  knowledgeTags: KnowledgeTag[]
  problems: Problem[]
  filter: 'all' | 'wrong' | 'unknown' | 'correct'
  filteredProblems: Problem[]
  wrongCount: number
  unknownCount: number
  correctCount: number
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
    problems: [],
    filter: 'all',
    filteredProblems: [],
    wrongCount: 0,
    unknownCount: 0,
    correctCount: 0,
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
    const date = options?.date || ''

    if (date) {
      const app = getApp<{ globalData: AppGlobal }>()
      const student = app.globalData.currentStudent
      if (student) this.loadByDate(date, student.id)
    } else if (assignmentId) {
      this.loadAssignment(assignmentId)
    }
  },

  async loadByDate(date: string, studentId: number) {
    this.setData({ loading: true })
    try {
      const res = await assignmentsApi.byDate(studentId, date)
      if (res.success && res.data) {
        const { totalCount, correctCount, wrongCount, unknownCount, problems = [] } = res.data
        const knowledgeTags = buildKnowledgeTags(problems)
        const assignment: Assignment = {
          id: 0,
          studentId,
          chapterId: 0,
          planDate: date,
          imageUrl: '',
          status: 'reviewed',
          totalCount,
          correctCount,
          wrongCount,
          unknownCount,
          problems: [],
        }
        this.setData({ assignment, problems, filteredProblems: problems, knowledgeTags, wrongCount, unknownCount, correctCount })
      } else {
        console.error('[summary] byDate failed:', res.error)
        // API 失败时也设置 assignment（空状态），避免页面全空白
        this.setData({
          assignment: {
            id: 0, studentId, chapterId: 0, planDate: date, imageUrl: '',
            status: 'reviewed', totalCount: 0, correctCount: 0, wrongCount: 0, unknownCount: 0, problems: [],
          },
        })
      }
    } catch (err) {
      console.error('[summary] loadByDate exception:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadAssignment(id: number) {
    this.setData({ loading: true })
    try {
      const res = await assignmentsApi.get(id)
      if (res.success && res.data) {
        const problems = res.data.problems ?? []
        const knowledgeTags = buildKnowledgeTags(problems)
        const wrongCount = problems.filter((p: Problem) => p.result === 'wrong').length
        const unknownCount = problems.filter((p: Problem) => p.result === 'unknown').length
        const correctCount = problems.filter((p: Problem) => p.result === 'correct').length
        this.setData({
          assignment: res.data,
          problems,
          filteredProblems: problems,
          knowledgeTags,
          wrongCount,
          unknownCount,
          correctCount
        })
      }
    } catch (err) {
      console.error('loadAssignment error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  onFilterChange(e: WechatMiniprogram.BaseEvent) {
    const dataset = e.currentTarget.dataset as { filter?: string }
    const tapped = (dataset.filter || 'all') as SummaryPageData['filter']
    const { problems, filter } = this.data
    const next = tapped === filter ? 'all' : tapped
    const filteredProblems = next === 'all'
      ? problems
      : problems.filter((p: Problem) => p.result === next)
    this.setData({ filter: next, filteredProblems })
  },

  onProblemTap(e: WechatMiniprogram.BaseEvent) {
    const dataset = e.currentTarget.dataset as { id?: string }
    const id = dataset.id || ''
    const { filteredProblems, assignment } = this.data
    const index = filteredProblems.findIndex((p: Problem) => String(p.id) === String(id))
    const ids = filteredProblems.map((p: Problem) => p.id).join(',')
    const assignmentId = assignment?.id ?? 0
    wx.navigateTo({
      url: `/pages/checkin/problem-detail/index?problemId=${id}&problemIds=${ids}&currentIndex=${index}&assignmentId=${assignmentId}`
    })
  },

  onStartReview() {
    const { filteredProblems, assignment } = this.data
    if (!filteredProblems.length || !assignment) {
      wx.showToast({ title: '暂无题目', icon: 'none' })
      return
    }
    const ids = filteredProblems.map((p: Problem) => p.id).join(',')
    const firstId = filteredProblems[0].id
    wx.navigateTo({
      url: `/pages/checkin/problem-detail/index?problemId=${firstId}&problemIds=${ids}&currentIndex=0&assignmentId=${assignment.id}`
    })
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/home/index' })
  }
})
