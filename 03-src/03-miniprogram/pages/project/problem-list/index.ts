import { Problem, Assignment } from '../../../types/index'
import { assignmentsApi, api } from '../../../services/api'
import type { AppGlobal } from '../../../app'

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
  mode: 'assignment' | 'chapter' | 'date'
  date: string
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
    date: '',
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

    const date = options?.date || ''

    if (date) {
      const app = getApp<{ globalData: AppGlobal }>()
      const student = app.globalData.currentStudent
      if (!student) { this.setData({ loading: false }); return }
      this.setData({ date, mode: 'date', filter: 'all' })
      this.loadProblemsByDate(date, student.id)
    } else if (chapterId && studentId) {
      this.setData({ chapterId, studentId, mode: 'chapter', filter: 'all' })
      this.loadChapterProblems()
    } else {
      // assignmentId 路径：先拿到 planDate，统一走 byDate 全天视图
      this.setData({ assignmentId, mode: 'date', filter: 'all' })
      this.loadProblemsByAssignmentDate(assignmentId)
    }
  },

  async loadProblemsByDate(date: string, studentId: number) {
    this.setData({ loading: true })
    try {
      const res = await assignmentsApi.byDate(studentId, date)
      if (res.success && res.data) {
        this.setData({ problems: res.data.problems || [] })
        this.refreshCounts()
        this.applyFilter()
      }
    } catch (err) {
      console.error('loadProblemsByDate error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadProblemsByAssignmentDate(assignmentId: number) {
    this.setData({ loading: true })
    try {
      const res = await assignmentsApi.get(assignmentId)
      if (res.success && res.data?.planDate) {
        const date = res.data.planDate
        const app = getApp<{ globalData: AppGlobal }>()
        const student = app.globalData.currentStudent
        if (!student) { this.setData({ loading: false }); return }
        this.setData({ date })
        await this.loadProblemsByDate(date, student.id)
        return
      }
    } catch (err) {
      console.error('loadProblemsByAssignmentDate error:', err)
    }
    this.setData({ loading: false })
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
    const { filteredProblems, assignmentId } = this.data
    const index = filteredProblems.findIndex((p: Problem) => String(p.id) === String(id))
    const ids = filteredProblems.map((p: Problem) => p.id).join(',')
    wx.navigateTo({
      url: `/pages/checkin/problem-detail/index?problemId=${id}&problemIds=${ids}&currentIndex=${index}&assignmentId=${assignmentId}`
    })
  },

  onStartReview() {
    const { filteredProblems, assignmentId } = this.data
    if (filteredProblems.length === 0) {
      wx.showToast({ title: '暂无题目', icon: 'none' })
      return
    }
    const ids = filteredProblems.map((p: Problem) => p.id).join(',')
    const firstId = filteredProblems[0].id
    wx.navigateTo({
      url: `/pages/checkin/problem-detail/index?problemId=${firstId}&problemIds=${ids}&currentIndex=0&assignmentId=${assignmentId}`
    })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  }
})
