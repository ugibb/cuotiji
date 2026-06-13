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

function formatDateFull(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${WEEKDAY_SHORT[d.getDay()]}`
}

const QUOTES = [
  { text: '锲而不舍，金石可镌', from: '《荀子·劝学》' },
  { text: '不积跬步，无以至千里', from: '《荀子·劝学》' },
  { text: '学而时习之，不亦说乎', from: '《论语》' },
  { text: '温故而知新，可以为师矣', from: '《论语》' },
  { text: '业精于勤，荒于嬉', from: '《进学解》' },
  { text: '博学之，审问之，慎思之', from: '《中庸》' },
  { text: '学如逆水行舟，不进则退', from: '古训' },
]

function todayDateStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${zeroPad(now.getMonth() + 1)}-${zeroPad(now.getDate())}`
}


const STATUS_CIRCLE: Record<string, string> = {
  done: 'c-done',
  not_uploaded: 'c-miss',
  uploaded_pending: 'c-pending',
  planned: 'c-future',
}

const STATUS_UL: Record<string, string> = {
  done: 'ul-green',
  not_uploaded: 'ul-red',
  uploaded_pending: 'ul-orange',
  planned: 'ul-gray',
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

function buildThreeWeekDays(windowStart: Date, plans: TrainingPlan[]): CalendarDay[] {
  const tStr = todayDateStr()
  const days: CalendarDay[] = []
  for (let i = 0; i < 21; i++) {
    const d = new Date(windowStart)
    d.setDate(windowStart.getDate() + i)
    const dateStr = `${d.getFullYear()}-${zeroPad(d.getMonth() + 1)}-${zeroPad(d.getDate())}`
    const status = getDayStatus(dateStr, plans, tStr)
    const isToday = dateStr === tStr
    const isPast = dateStr <= tStr
    const hasPlan = status !== 'no_plan'
    const circleClass = [STATUS_CIRCLE[status] || '', isToday ? 'c-today' : ''].join(' ').trim()
    const numClass = [STATUS_NUM[status] || '', isToday ? 'n-today' : ''].join(' ').trim()
    let underlineClass = ''
    if (STATUS_UL[status]) {
      underlineClass = STATUS_UL[status]
    } else if (status === 'no_plan' && isPast) {
      underlineClass = 'ul-dim'
    }
    days.push({
      date: dateStr,
      status,
      plan: plans.find((p) => p.planDate === dateStr),
      day: d.getDate(),
      isToday,
      isPast,
      hasPlan,
      circleClass,
      numClass,
      underlineClass,
    })
  }
  return days
}

function calcWindowStart(anchor: Date): Date {
  const dow = anchor.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const thisMonday = new Date(anchor)
  thisMonday.setDate(anchor.getDate() + mondayOffset)
  thisMonday.setHours(0, 0, 0, 0)
  const ws = new Date(thisMonday)
  ws.setDate(thisMonday.getDate() - 7)
  return ws
}

interface PlanSummary {
  daysLeft: number
}

interface MilestoneSeg {
  label: string
  flex: number
  fillPct: number
  isActive: boolean
}

interface HomePageData {
  hasPlan: boolean
  loading: boolean
  daysLeft: number
  statusBarHeight: number
  navAreaHeight: number
  plan: PlanSummary | null
  m1Day: number
  m1Pct: number
  todayPlan: TrainingPlan | null
  todayStr: string
  todayKey: string
  recentPractices: RecentPractice[]
  windowStartDate: string
  calRangeLabel: string
  calendarDays: CalendarDay[]
  selectedDate: string
  selectedDayLabel: string
  selectedDayPlan: TrainingPlan | null
  selectedDayStatus: DayStatus
  todayDateFull: string
  quote: string
  quoteFrom: string
  weeklyDone: number
  weeklyTotal: number
  weeklyChapter: string
  milestoneLabel: string
  milestoneDeadline: string
  sprintStartDate: string
  overallMilestonePct: number
  m1m2DividerPct: string
  m2m3DividerPct: string
  m1FillPct: number
  m2FillPct: number
  m3FillPct: number
  milestoneSegs: MilestoneSeg[]
  weekDateRange: string
  weeklyGoalText: string
  weeklyPct: number
}

Page<HomePageData, Record<string, unknown>>({
  data: {
    hasPlan: false,
    loading: true,
    daysLeft: 0,
    statusBarHeight: 0,
    navAreaHeight: 0,
    plan: null,
    m1Day: 0,
    m1Pct: 0,
    todayPlan: null,
    todayStr: '',
    todayKey: '',
    recentPractices: [],
    windowStartDate: '',
    calRangeLabel: '',
    calendarDays: [],
    selectedDate: '',
    selectedDayLabel: '',
    selectedDayPlan: null,
    selectedDayStatus: 'no_plan' as DayStatus,
    todayDateFull: '',
    quote: '',
    quoteFrom: '',
    weeklyDone: 0,
    weeklyTotal: 0,
    weeklyChapter: '',
    milestoneLabel: 'M1',
    milestoneDeadline: '',
    sprintStartDate: '',
    overallMilestonePct: 0,
    m1m2DividerPct: '46.7%',
    m2m3DividerPct: '93.3%',
    m1FillPct: 0,
    m2FillPct: 0,
    m3FillPct: 0,
    milestoneSegs: [],
    weekDateRange: '',
    weeklyGoalText: '',
    weeklyPct: 0,
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync()
    const menuButton = wx.getMenuButtonBoundingClientRect()
    const navAreaHeight = menuButton.bottom + (menuButton.top - statusBarHeight)
    const now = new Date()
    const tStr = todayDateStr()
    const startOfYear = new Date(now.getFullYear(), 0, 0)
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000)
    const q = QUOTES[dayOfYear % QUOTES.length]
    const windowStart = calcWindowStart(now)
    this.setData({
      statusBarHeight,
      navAreaHeight,
      daysLeft: 0,
      selectedDate: tStr,
      todayKey: tStr,
      selectedDayLabel: formatDayLabel(now),
      todayDateFull: formatDateFull(now),
      quote: q.text,
      quoteFrom: q.from,
      windowStartDate: windowStart.toISOString().slice(0, 10),
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

      // 全项目进度（M1+M2+M3 共 45 天）
      const M_DAYS = [21, 21, 3]
      const totalMilestoneDays = M_DAYS.reduce((a, b) => a + b, 0)
      const overallMilestonePct = Math.min(100, Math.round((elapsed + 1) / totalMilestoneDays * 100))
      // 分隔线位置（按实际天数比例）
      const m1m2DividerPct = `${(M_DAYS[0] / totalMilestoneDays * 100).toFixed(1)}%`
      const m2m3DividerPct = `${((M_DAYS[0] + M_DAYS[1]) / totalMilestoneDays * 100).toFixed(1)}%`
      // 各里程碑独立填充进度
      const m1FillPct = Math.min(100, Math.max(0, Math.round((elapsed + 1) / M_DAYS[0] * 100)))
      const m2FillPct = Math.min(100, Math.max(0, Math.round((elapsed - M_DAYS[0] + 1) / M_DAYS[1] * 100)))
      const m3FillPct = Math.min(100, Math.max(0, Math.round((elapsed - M_DAYS[0] - M_DAYS[1] + 1) / M_DAYS[2] * 100)))

      const tStr = todayDateStr()
      const todayLabel = formatDayLabel(new Date())

      this.setData({
        hasPlan: true,
        plan: { daysLeft: activePlan.daysLeft },
        sprintStartDate: startDate.toISOString().slice(0, 10),
        m1Day,
        m1Pct,
        overallMilestonePct,
        m1m2DividerPct,
        m2m3DividerPct,
        m1FillPct,
        m2FillPct,
        m3FillPct,
        todayStr: todayLabel,
        daysLeft: activePlan.daysLeft,
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
    const { windowStartDate } = this.data
    const windowStart = new Date(windowStartDate)
    const windowEnd = new Date(windowStart)
    windowEnd.setDate(windowStart.getDate() + 20)

    const fmtShort = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`
    const calRangeLabel = `${fmtShort(windowStart)} — ${fmtShort(windowEnd)}`
    this.setData({ calRangeLabel })

    try {
      // 收集窗口跨越的月份（可能跨月）
      const monthSet = new Set<string>()
      for (let i = 0; i < 21; i++) {
        const d = new Date(windowStart)
        d.setDate(windowStart.getDate() + i)
        monthSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
      }

      // 并行拉取所有涉及月份的训练计划
      const planArrays = await Promise.all(
        Array.from(monthSet).map((ym) => {
          const [y, m] = ym.split('-').map(Number)
          return calendarApi.get(y, m, studentId)
            .then((r) => (r.success && r.data?.plans) ? r.data.plans : [])
        })
      )
      const trainingPlans = planArrays.flat()

      const calendarDays = buildThreeWeekDays(windowStart, trainingPlans)
      const todayPlan = trainingPlans.find((p) => p.planDate === tStr) || null
      const { selectedDate } = this.data

      // 本周范围（以今天为基准，固定不随导航变化）
      const now = new Date()
      const dow = now.getDay()
      const mondayOffset = dow === 0 ? -6 : 1 - dow
      const monday = new Date(now)
      monday.setDate(now.getDate() + mondayOffset)
      monday.setHours(0, 0, 0, 0)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const weekDateRange = `${fmtShort(monday)} — ${fmtShort(sunday)}`
      const mondayStr = `${monday.getFullYear()}-${zeroPad(monday.getMonth() + 1)}-${zeroPad(monday.getDate())}`
      const sundayStr = `${sunday.getFullYear()}-${zeroPad(sunday.getMonth() + 1)}-${zeroPad(sunday.getDate())}`
      const weekPlans = trainingPlans.filter((p) => p.planDate >= mondayStr && p.planDate <= sundayStr)
      const weeklyTotal = weekPlans.length
      const weeklyDone = weekPlans.filter((p) => p.assignmentStatus === 'completed').length

      // 当前里程碑（取所有已拉取计划中第一个有 chapter 的）
      const milestonePlan = trainingPlans.find((p) => p.chapter?.name)
      const weeklyChapter = milestonePlan?.chapter?.name ?? ''
      const milestoneCode = milestonePlan?.chapter?.code ?? ''
      const milestoneLabel =
        milestoneCode === 'C01' ? 'M1' :
        milestoneCode === 'C02' ? 'M2' : 'M3'

      const MILESTONE_END_OFFSET: Record<string, number> = { M1: 20, M2: 41, M3: 44 }
      const { sprintStartDate } = this.data
      const milestoneDeadline = (() => {
        if (!sprintStartDate) return ''
        const end = new Date(sprintStartDate)
        end.setDate(end.getDate() + (MILESTONE_END_OFFSET[milestoneLabel] ?? 20))
        return `截止 ${end.getMonth() + 1}月${end.getDate()}日`
      })()
      const weeklyGoalText = weeklyTotal > 0
        ? `掌握${weeklyChapter}核心内容，完成 ${weeklyTotal} 次训练`
        : '本周暂无训练计划'
      const weeklyPct = weeklyTotal > 0 ? Math.round((weeklyDone / weeklyTotal) * 100) : 0

      // 里程碑分段数组（数据驱动，含当前激活状态）
      const { m1FillPct, m2FillPct, m3FillPct } = this.data
      const milestoneSegs: MilestoneSeg[] = [
        { label: 'M1', flex: 21, fillPct: m1FillPct, isActive: milestoneLabel === 'M1' },
        { label: 'M2', flex: 21, fillPct: m2FillPct, isActive: milestoneLabel === 'M2' },
        { label: 'M3', flex: 3,  fillPct: m3FillPct, isActive: milestoneLabel === 'M3' },
      ]

      const selDay = calendarDays.find((d) => d.date === selectedDate)
      this.setData({
        calRangeLabel,
        calendarDays,
        todayPlan,
        selectedDayPlan: selDay?.plan ?? null,
        selectedDayStatus: selDay?.status ?? 'no_plan',
        weekDateRange,
        weeklyTotal,
        weeklyDone,
        weeklyChapter,
        milestoneLabel,
        milestoneDeadline,
        milestoneSegs,
        weeklyGoalText,
        weeklyPct,
      })
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

  onPrevWeek() {
    const { windowStartDate } = this.data
    const d = new Date(windowStartDate)
    d.setDate(d.getDate() - 7)
    this.setData({ windowStartDate: d.toISOString().slice(0, 10) })
    const app = getApp<{ globalData: AppGlobal }>()
    const student = app.globalData.currentStudent
    if (student) this.loadCalendar(student.id, todayDateStr())
  },

  onNextWeek() {
    const { windowStartDate } = this.data
    const d = new Date(windowStartDate)
    d.setDate(d.getDate() + 7)
    this.setData({ windowStartDate: d.toISOString().slice(0, 10) })
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

  onGoProject() {
    wx.navigateTo({ url: '/pages/project/index' })
  },

  onGoWeaknessMap() {
    wx.navigateTo({ url: '/pages/project/analysis/index' })
  },

  onGoDailyReview() {
    wx.navigateTo({ url: '/pages/project/review/index' })
  },

  onStartSetup() {
    wx.navigateTo({ url: '/pages/onboarding/goals/index' })
  },

  onDayActionUpload() {
    const date = this.data.selectedDate || todayDateStr()
    const chapterId = this.data.selectedDayPlan?.chapterId || 0
    const chapterName = encodeURIComponent(this.data.selectedDayPlan?.chapter?.name || '')
    wx.navigateTo({ url: `/pages/checkin/daily/index?date=${date}&chapterId=${chapterId}&chapterName=${chapterName}` })
  },

  onDayActionReview() {
    const { selectedDate } = this.data
    if (!selectedDate) return
    wx.navigateTo({ url: `/pages/checkin/summary/index?date=${selectedDate}` })
  },

  onDayActionView() {
    const { selectedDate } = this.data
    if (!selectedDate) return
    wx.navigateTo({ url: `/pages/checkin/summary/index?date=${selectedDate}` })
  },

})
