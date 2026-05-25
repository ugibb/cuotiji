import { TrainingPlan, CalendarDay, DayStatus, SprintPlan, RecentPractice } from '../../types/index'
import { sprintApi, calendarApi, assignmentsApi } from '../../services/api'
import type { AppGlobal } from '../../app'

function zeroPad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function formatDayLabel(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${WEEKDAY_SHORT[d.getDay()]}`
}

function todayDateStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${zeroPad(now.getMonth() + 1)}-${zeroPad(now.getDate())}`
}

function calcDaysLeft(): number {
  const exam = new Date('2026-11-20')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / 86400000))
}

const STATUS_CIRCLE: Record<string, string> = {
  done: 'c-done',
  not_uploaded: 'c-miss',
  uploaded_pending: 'c-pending',
}

const STATUS_NUM: Record<string, string> = {
  done: 'n-done',
  not_uploaded: 'n-miss',
  uploaded_pending: 'n-pending',
  no_plan: 'n-noplan',
  planned: '',
}

function getDayStatus(dateStr: string, plans: TrainingPlan[], todayStr: string): DayStatus {
  const plan = plans.find((p) => p.planDate === dateStr)
  if (!plan) return 'no_plan'
  if (plan.assignmentStatus === 'completed') return 'done'
  if (plan.assignmentStatus === 'uploaded_pending') return 'uploaded_pending'
  return dateStr <= todayStr ? 'not_uploaded' : 'planned'
}

function buildCalendarDays(year: number, month: number, plans: TrainingPlan[]): CalendarDay[] {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const tStr = todayDateStr()
  const days: CalendarDay[] = []

  const startDow = (firstDay.getDay() + 6) % 7
  for (let i = 0; i < startDow; i++) {
    days.push({ date: '', status: 'no_plan', day: 0, isToday: false, hasPlan: false, circleClass: '', numClass: '', isPast: false })
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${zeroPad(month)}-${zeroPad(d)}`
    const status = getDayStatus(dateStr, plans, tStr)
    const isToday = dateStr === tStr
    const isPast = dateStr <= tStr
    const hasPlan = status !== 'no_plan'
    const circleClass = [STATUS_CIRCLE[status] || '', isToday ? 'c-today' : ''].join(' ').trim()
    const numClass = [STATUS_NUM[status] || '', isToday ? 'n-today' : ''].join(' ').trim()
    days.push({
      date: dateStr,
      status,
      plan: plans.find((p) => p.planDate === dateStr),
      day: d,
      isToday,
      isPast,
      hasPlan,
      circleClass,
      numClass,
    })
  }

  return days
}

interface PlanSummary {
  daysLeft: number
}

interface HomePageData {
  hasPlan: boolean
  loading: boolean
  daysLeft: number
  statusBarHeight: number
  plan: PlanSummary | null
  m1Day: number
  m1Pct: number
  todayPlan: TrainingPlan | null
  todayStr: string
  recentPractices: RecentPractice[]
  year: number
  month: number
  monthLabel: string
  calendarDays: CalendarDay[]
  selectedDate: string
  selectedDayLabel: string
  selectedDayPlan: TrainingPlan | null
  selectedDayStatus: DayStatus
}

Page<HomePageData, Record<string, unknown>>({
  data: {
    hasPlan: false,
    loading: true,
    daysLeft: 0,
    statusBarHeight: 0,
    plan: null,
    m1Day: 0,
    m1Pct: 0,
    todayPlan: null,
    todayStr: '',
    recentPractices: [],
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    monthLabel: '',
    calendarDays: [],
    selectedDate: '',
    selectedDayLabel: '',
    selectedDayPlan: null,
    selectedDayStatus: 'no_plan' as DayStatus,
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync()
    const now = new Date()
    const tStr = todayDateStr()
    this.setData({
      statusBarHeight,
      daysLeft: calcDaysLeft(),
      selectedDate: tStr,
      selectedDayLabel: formatDayLabel(now),
    })
  },

  onShow() {
    this.loadPage()
  },

  async loadPage() {
    this.setData({ loading: true })
    try {
      const app = getApp<{ globalData: AppGlobal }>()
      const student = app.globalData.currentStudent
      if (!student) {
        this.setData({ hasPlan: false, loading: false })
        return
      }

      const res = await sprintApi.active(student.id)
      const plans: SprintPlan[] = (res.success && res.data?.plans) ? res.data.plans : []
      const activePlan = plans[0] || null

      if (!activePlan) {
        this.setData({ hasPlan: false, loading: false })
        return
      }

      const startDate = new Date(activePlan.createdAt)
      startDate.setHours(0, 0, 0, 0)
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      const elapsed = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / 86400000))
      const m1Day = Math.min(21, elapsed + 1)
      const m1Pct = Math.round((m1Day / 21) * 100)

      const tStr = todayDateStr()
      const todayLabel = formatDayLabel(new Date())

      this.setData({
        hasPlan: true,
        plan: { daysLeft: calcDaysLeft() },
        m1Day,
        m1Pct,
        todayStr: todayLabel,
        daysLeft: calcDaysLeft(),
      })

      await Promise.all([
        this.loadCalendar(student.id, tStr),
        this.loadRecentPractices(student.id),
      ])
    } catch (err) {
      console.error('loadPage error:', err)
      this.setData({ hasPlan: false, loading: false })
    }
  },

  async loadCalendar(studentId: number, tStr: string) {
    const { year, month } = this.data
    this.setData({ monthLabel: `${year}年${zeroPad(month)}月` })
    try {
      const res = await calendarApi.get(year, month, studentId)
      if (res.success && res.data) {
        const trainingPlans = res.data.plans
        const calendarDays = buildCalendarDays(year, month, trainingPlans)
        const todayPlan = trainingPlans.find((p) => p.planDate === tStr) || null
        const { selectedDate } = this.data
        const selDay = calendarDays.find((d) => d.date === selectedDate)
        this.setData({
          calendarDays,
          todayPlan,
          selectedDayPlan: selDay?.plan ?? null,
          selectedDayStatus: selDay?.status ?? 'no_plan',
        })
      }
    } catch (err) {
      console.error('loadCalendar error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadRecentPractices(studentId: number) {
    try {
      const res = await assignmentsApi.list(studentId)
      if (res.success && res.data?.assignments) {
        const recent: RecentPractice[] = res.data.assignments
          .filter((a) => a.status === 'graded' || a.status === 'reviewed')
          .slice(0, 3)
          .map((a) => ({
            topic: a.planDate,
            date: a.planDate,
            totalCount: a.totalCount,
            correctCount: a.correctCount,
            wrongCount: a.wrongCount,
          }))
        this.setData({ recentPractices: recent })
      }
    } catch {
      // 非关键数据，静默忽略
    }
  },

  onPrevMonth() {
    let { year, month } = this.data
    month -= 1
    if (month < 1) { month = 12; year -= 1 }
    this.setData({ year, month })
    const app = getApp<{ globalData: AppGlobal }>()
    const student = app.globalData.currentStudent
    if (student) this.loadCalendar(student.id, todayDateStr())
  },

  onNextMonth() {
    let { year, month } = this.data
    month += 1
    if (month > 12) { month = 1; year += 1 }
    this.setData({ year, month })
    const app = getApp<{ globalData: AppGlobal }>()
    const student = app.globalData.currentStudent
    if (student) this.loadCalendar(student.id, todayDateStr())
  },

  onDayTap(e: WechatMiniprogram.BaseEvent) {
    const dataset = e.currentTarget.dataset as { date?: string }
    const date = dataset.date
    if (!date) return
    const calDay = this.data.calendarDays.find((d: CalendarDay) => d.date === date)
    if (!calDay || !calDay.date) return
    this.setData({
      selectedDate: date,
      selectedDayLabel: formatDayLabel(new Date(date)),
      selectedDayPlan: calDay.plan ?? null,
      selectedDayStatus: calDay.status,
    })
  },

  onTodayAction() {
    wx.navigateTo({ url: `/pages/camera/index?date=${todayDateStr()}` })
  },

  onGoProject() {
    wx.navigateTo({ url: '/pages/project/index' })
  },

  onStartSetup() {
    wx.navigateTo({ url: '/pages/onboarding/index' })
  },

  onDayActionUpload() {
    const date = this.data.selectedDate || todayDateStr()
    wx.navigateTo({ url: `/pages/camera/index?date=${date}` })
  },

  onDayActionReview() {
    const { selectedDate } = this.data
    if (!selectedDate) return
    wx.navigateTo({ url: `/pages/problem-list/index?date=${selectedDate}` })
  },
})
