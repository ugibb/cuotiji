import { sprintApi, trainingPlansApi } from '../../../services/api'
import { Milestone } from '../../../types/index'
import type { AppGlobal } from '../../../app'

interface ServerMilestone {
  seq: number
  name: string
  startDate: string
  endDate: string
  durationDays: number
  status: string
  scoreBefore: number | null
  scoreTarget: number | null
  tags: string[]
}

interface PreviewResult {
  totalDays: number
  dailyMinutes: number
  milestoneCount: number
  milestones: ServerMilestone[]
}

interface PlanInfo {
  totalDays: number
  milestoneCount: number
  dailyTime: string
  goalText: string
  milestones: Milestone[]
}

interface PlanPreviewPageData {
  statusBarHeight: number
  headerHeight: number
  plan: PlanInfo
  examDate: string       // 当前选中的考试日期（驱动 totalDays）
  dailyMinutes: number   // 当前每日时长（分钟）
  saving: boolean
  recalculating: boolean
}

// ─── 映射函数 ────────────────────────────────────────────────────────────────

const DAILY_OPTIONS = [
  { label: '< 30 分钟', minutes: 25, display: '<30分钟' },
  { label: '30 ~ 60 分钟', minutes: 45, display: '≈45分钟' },
  { label: '1 ~ 2 小时', minutes: 90, display: '≈1.5h' },
  { label: '2 小时以上', minutes: 150, display: '>2h' },
]

function minutesToDisplay(minutes: number): string {
  return DAILY_OPTIONS.find(o => o.minutes === minutes)?.display ?? `${minutes}分钟`
}

function weeklyHoursToDailyMinutes(wh: string): number {
  const map: Record<string, number> = { lt30min: 25, '30to60min': 45, '1to2h': 90, gt2h: 150 }
  return map[wh] ?? 45
}

function buildGoalText(grade: string, goal: string): string {
  const groupMap: Record<string, string> = {
    g1: '低年级组', g2: '低年级组', g3: '小学组', g4: '小学组', g5: '高年级组', g6: '高年级组',
  }
  const goalTextMap: Record<string, string> = { entry: '初次参赛', award: '冲刺获奖', top: '挑战一等奖' }
  return `目标：华杯${groupMap[grade] ?? '小学组'} · ${goalTextMap[goal] ?? '冲刺获奖'}`
}

function calcTotalDays(examDate: string): number {
  if (!examDate) return 180
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exam = new Date(examDate); exam.setHours(0, 0, 0, 0)
  return Math.max(7, Math.ceil((exam.getTime() - today.getTime()) / 86400000))
}

function fmtMonthDay(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

const TAG_COLORS: Array<'blue' | 'amber' | 'green'> = ['blue', 'amber', 'green']

function serverMilestonesToDisplay(list: ServerMilestone[]): Milestone[] {
  let dayStart = 1
  return list.map((m, i) => {
    const dayEnd = dayStart + m.durationDays - 1
    const dateRange = `${fmtMonthDay(m.startDate)} — ${fmtMonthDay(m.endDate)} · ${m.durationDays}个学习日`
    const goal = m.scoreTarget
      ? `重点突破 · ${m.name} ${m.scoreBefore ?? '?'}→${m.scoreTarget}分`
      : `冲刺阶段 · 综合实战演练`
    const result: Milestone = {
      id: `M${m.seq}`,
      title: m.name,
      tagColor: TAG_COLORS[i % TAG_COLORS.length],
      dayRange: `第 ${dayStart}-${dayEnd} 天`,
      dateRange,
      tags: m.tags ?? [],
      goal,
      status: m.status as 'active' | 'pending' | 'done',
    }
    dayStart = dayEnd + 1
    return result
  })
}

// ─── Page ────────────────────────────────────────────────────────────────────

Page<PlanPreviewPageData, Record<string, unknown>>({
  data: {
    statusBarHeight: 0,
    headerHeight: 0,
    plan: {
      totalDays: 0,
      milestoneCount: 3,
      dailyTime: '计算中…',
      goalText: '',
      milestones: [],
    },
    examDate: '',
    dailyMinutes: 45,
    saving: false,
    recalculating: true,
  },

  async onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync()
    this.setData({ statusBarHeight })
    wx.nextTick(() => {
      wx.createSelectorQuery().in(this).select('.page-header').boundingClientRect(rect => {
        if (rect) this.setData({ headerHeight: rect.height })
      }).exec()
    })

    const app = getApp<{ globalData: AppGlobal }>()
    const setup = app.globalData.onboardingSetup
    const answers = app.globalData.intakeAnswers

    const examDate = setup?.examDate ?? ''
    const dailyMinutes = weeklyHoursToDailyMinutes(answers?.weeklyHours ?? 'lt30min')
    const grade = setup?.grade ?? 'g4'
    const goal = setup?.target ?? 'entry'

    this.setData({
      examDate,
      dailyMinutes,
      'plan.totalDays': calcTotalDays(examDate),
      'plan.dailyTime': minutesToDisplay(dailyMinutes),
      'plan.goalText': buildGoalText(grade, goal),
    })

    await this._fetchPreview(examDate, dailyMinutes)
  },

  // 点击「学习天数」— 日期选择器回调
  async onExamDateChange(e: WechatMiniprogram.PickerChange) {
    const examDate = e.detail.value as string
    const totalDays = calcTotalDays(examDate)
    this.setData({ examDate, 'plan.totalDays': totalDays })
    await this._fetchPreview(examDate, this.data.dailyMinutes)
  },

  // 点击「每日时长」— ActionSheet
  onTapTime() {
    wx.showActionSheet({
      itemList: DAILY_OPTIONS.map(o => o.label),
      success: async (res) => {
        const opt = DAILY_OPTIONS[res.tapIndex]
        if (!opt) return
        this.setData({ dailyMinutes: opt.minutes, 'plan.dailyTime': opt.display })
        await this._fetchPreview(this.data.examDate, opt.minutes)
      },
    })
  },

  // 调预览接口（不入库）
  async _fetchPreview(examDate: string, dailyMinutes: number) {
    this.setData({ recalculating: true })
    try {
      const res = await trainingPlansApi.preview({ examDate: examDate || undefined, dailyMinutes })
      if (res.success && res.data) {
        const d = res.data as unknown as PreviewResult
        this.setData({
          'plan.totalDays': d.totalDays,
          'plan.milestoneCount': d.milestoneCount,
          'plan.milestones': serverMilestonesToDisplay(d.milestones),
        })
      }
    } catch {
      // 网络失败时保留客户端算出的 totalDays
    } finally {
      this.setData({ recalculating: false })
    }
  },

  onBack() {
    wx.navigateBack()
  },

  // 点击「确认计划」— 入库
  async onConfirm() {
    if (this.data.saving) return
    this.setData({ saving: true })

    const app = getApp<{ globalData: AppGlobal }>()
    const studentId = app.globalData.currentStudent?.id
    const setup = app.globalData.onboardingSetup

    if (studentId) {
      wx.showLoading({ title: '备赛计划生成中…' })
      try {
        // generate 负责入库
        await trainingPlansApi.generate({
          studentId,
          examDate: this.data.examDate || setup?.examDate,
          competitionName: setup?.examName ?? '华杯小学数学邀请赛',
          dailyMinutes: this.data.dailyMinutes,
        })

        // 同步冲刺计划记录，供首页使用
        const sprintRes = await sprintApi.create({
          studentId,
          subject: setup?.examName ?? '华杯小学数学邀请赛',
          examDate: this.data.examDate || setup?.examDate || '2026-11-20',
        })
        if (sprintRes.success && sprintRes.data) {
          app.globalData.activePlan = sprintRes.data as unknown as AppGlobal['activePlan']
          wx.setStorageSync('activePlan', sprintRes.data)
        }
      } catch {
        // 入库失败不阻断，首页可补
      } finally {
        wx.hideLoading()
      }
    }

    this.setData({ saving: false })
    wx.reLaunch({ url: '/pages/home/index' })
  },
})
