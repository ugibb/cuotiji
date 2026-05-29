import { Problem, Assignment } from '../../../types/index'
import { assignmentsApi, api } from '../../../services/api'

interface ProblemListPageData {
  problems: Problem[]
  assignment: Assignment | null
  loading: boolean
  filter: 'all' | 'wrong' | 'unknown' | 'correct'
  filteredProblems: Problem[]
  wrongCount: number
  unknownCount: number
  correctCount: number
  assignmentId: number
  chapterId: number
  studentId: number
  mode: 'assignment' | 'chapter'
  statusBarHeight: number
  safeAreaBottom: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Page<ProblemListPageData, any>({
  data: {
    problems: [],
    assignment: null,
    loading: true,
    filter: 'all',
    filteredProblems: [],
    wrongCount: 0,
    unknownCount: 0,
    correctCount: 0,
    assignmentId: 0,
    chapterId: 0,
    studentId: 0,
    mode: 'assignment',
    statusBarHeight: 44,
    safeAreaBottom: 34
  },

  onLoad(options: Record<string, string | undefined>) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const statusBarHeight = sysInfo.statusBarHeight || 44
    const safeAreaBottom = (sysInfo as { safeAreaInsets?: { bottom?: number } }).safeAreaInsets?.bottom ?? 34
    this.setData({ statusBarHeight, safeAreaBottom })

    const assignmentId = Number(options?.assignmentId || 0)
    const chapterId = Number(options?.chapterId || 0)
    const studentId = Number(options?.studentId || 0)

    if (chapterId && studentId) {
      this.setData({ chapterId, studentId, mode: 'chapter', filter: 'all' })
      this.loadChapterProblems()
    } else {
      this.setData({ assignmentId, mode: 'assignment' })
      this.loadProblems()
    }
  },

  async loadProblems() {
    const { assignmentId } = this.data
    if (!assignmentId) return

    this.setData({ loading: true })
    try {
      const res = await assignmentsApi.get(assignmentId)
      if (res.success && res.data) {
        this.setData({ assignment: res.data, problems: res.data.problems || [] })
        this.refreshCounts()
        this.applyFilter()
      }
    } catch (err) {
      console.error('loadProblems error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadChapterProblems() {
    const { chapterId, studentId } = this.data
    this.setData({ loading: true })
    try {
      const res = await api.get<{ problems: Problem[] }>(
        '/analytics/chapter-problems',
        { studentId, chapterId }
      )
      if (res.success && res.data) {
        this.setData({ problems: res.data.problems })
        this.refreshCounts()
        this.applyFilter()
      }
    } catch (err) {
      console.error('loadChapterProblems error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  refreshCounts() {
    const { problems } = this.data
    const wrongCount = problems.filter((p: Problem) => p.result === 'wrong').length
    const unknownCount = problems.filter((p: Problem) => p.result === 'unknown').length
    const correctCount = problems.filter((p: Problem) => p.result === 'correct').length
    this.setData({ wrongCount, unknownCount, correctCount })
  },

  applyFilter() {
    const { problems, filter } = this.data
    const filtered = filter === 'all'
      ? problems
      : problems.filter((p: Problem) => p.result === filter)
    this.setData({ filteredProblems: filtered })
  },

  onFilterChange(e: WechatMiniprogram.BaseEvent) {
    const dataset = e.currentTarget.dataset as { filter?: string }
    const filter = (dataset.filter || 'all') as ProblemListPageData['filter']
    this.setData({ filter })
    this.applyFilter()
  },

  onProblemTap(e: WechatMiniprogram.BaseEvent) {
    const dataset = e.currentTarget.dataset as { id?: string }
    const id = dataset.id || ''
    const total = this.data.problems.length
    wx.navigateTo({ url: `/pages/checkin/problem-detail/index?problemId=${id}&total=${total}` })
  },

  onCompleteReview() {
    const { assignmentId } = this.data
    wx.navigateTo({ url: `/pages/checkin/review-done/index?assignmentId=${assignmentId}` })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  }
})
