import { sprintApi, trainingPlansApi } from '../../../services/api'
import { SprintPlan, Milestone } from '../../../types/index'
import type { AppGlobal } from '../../../app'

interface PlanInfo {
  totalDays: number
  milestoneCount: number
  dailyTime: string
  goalText: string
  milestones: Milestone[]
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmtMonthDay(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function buildPreviewMilestones(): Milestone[] {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const m1End = addDays(start, 20)
  const m2Start = addDays(start, 21)
  const m2End = addDays(start, 45)
  const m3Start = addDays(start, 46)
  const m3End = addDays(start, 66)
  return [
    {
      id: 'M1', title: '整除与余数', tagColor: 'blue',
      dayRange: '第 1-21 天',
      dateRange: `${fmtMonthDay(start)} — ${fmtMonthDay(m1End)} · 21个学习日`,
      tags: ['整除判断', '余数运算', '同余性质', '中国剩余定理入门'],
      goal: '重点突破 · 整除余数 45→75分', status: 'active',
    },
    {
      id: 'M2', title: '行程·应用综合', tagColor: 'amber',
      dayRange: '第 22-46 天',
      dateRange: `${fmtMonthDay(m2Start)} — ${fmtMonthDay(m2End)} · 25个学习日`,
      tags: ['相遇追及', '流水行船', '综合应用'],
      goal: '提升阶段 · 应用综合 55→72分', status: 'pending',
    },
    {
      id: 'M3', title: '综合冲刺', tagColor: 'green',
      dayRange: '第 47-67 天',
      dateRange: `${fmtMonthDay(m3Start)} — ${fmtMonthDay(m3End)} · 21个学习日`,
      tags: ['真题模拟', '弱点专项', '冲刺训练'],
      goal: '冲刺阶段 · 综合实战演练', status: 'pending',
    },
  ]
}

function buildDefaultPlanInfo(): PlanInfo {
  return {
    totalDays: 67,
    milestoneCount: 3,
    dailyTime: '≈1.5h',
    goalText: '目标：华杯小学组 · 冲刺获奖',
    milestones: buildPreviewMilestones(),
  }
}

interface PlanPreviewPageData {
  statusBarHeight: number
  headerHeight: number
  plan: PlanInfo
  saving: boolean
}

Page<PlanPreviewPageData, Record<string, unknown>>({
  data: {
    statusBarHeight: 0,
    headerHeight: 0,
    plan: buildDefaultPlanInfo(),
    saving: false,
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync()
    this.setData({ statusBarHeight })
    wx.nextTick(() => {
      wx.createSelectorQuery().in(this).select('.page-header').boundingClientRect(rect => {
        if (rect) this.setData({ headerHeight: rect.height })
      }).exec()
    })
  },

  onBack() {
    wx.navigateBack()
  },

  async onConfirm() {
    if (this.data.saving) return
    this.setData({ saving: true })

    const app = getApp<{ globalData: AppGlobal }>()
    const studentId = app.globalData.currentStudent?.id

    if (studentId) {
      try {
        wx.showLoading({ title: '生成计划中…' })

        // 生成里程碑 + 训练计划
        await trainingPlansApi.generate({
          studentId,
          examDate: '2026-11-20',
          competitionName: '华杯小学数学邀请赛',
        })

        // 同步创建冲刺计划记录（供首页 sprint active 接口使用）
        const sprintRes = await sprintApi.create({
          studentId,
          subject: '华杯小学数学邀请赛',
          examDate: '2026-11-20',
        })
        if (sprintRes.success && sprintRes.data) {
          app.globalData.activePlan = sprintRes.data as unknown as AppGlobal['activePlan']
          wx.setStorageSync('activePlan', sprintRes.data)
        }

        wx.hideLoading()
      } catch {
        wx.hideLoading()
        // 计划生成失败不阻断流程，首页可重新生成
      }
    }

    this.setData({ saving: false })
    wx.reLaunch({ url: '/pages/home/index' })
  },
})
