import { IntakeAnswers, CompetitionTarget } from '../../../types/index'
import type { AppGlobal } from '../../../app'

function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${y} 年 ${parseInt(m)} 月 ${parseInt(d)} 日`
}

function calcDaysLeftFrom(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86400000))
}

Page({
  data: {
    statusBarHeight: 0,
    headerHeight: 0,
    examDate: '',
    examDateDisplay: '请选择竞赛日期',
    daysLeft: 0,
    grade: 'g1',
    goal: 'award',
    q1: '',
    q3: '',
    canNext: false,
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

  onDateChange(e: WechatMiniprogram.PickerChange) {
    const dateStr = e.detail.value as string
    this.setData(
      {
        examDate: dateStr,
        examDateDisplay: formatDateDisplay(dateStr),
        daysLeft: calcDaysLeftFrom(dateStr),
      },
      () => this._checkCanNext()
    )
  },

  onGrade(e: WechatMiniprogram.TouchEvent) {
    const val = e.currentTarget.dataset.val as string
    const isJunior = val === 'g1' || val === 'g2'
    this.setData(
      { grade: val, ...(isJunior ? { goal: 'entry' } : {}) },
      () => this._checkCanNext()
    )
  },

  onGoal(e: WechatMiniprogram.TouchEvent) {
    this.setData({ goal: e.currentTarget.dataset.val as string }, () => this._checkCanNext())
  },

  onPick(e: WechatMiniprogram.BaseEvent) {
    const { q, val } = e.currentTarget.dataset as { q: string; val: string }
    this.setData({ [q]: val }, () => this._checkCanNext())
  },

  _checkCanNext() {
    const { grade, goal, q1, q3, examDate } = this.data
    const isJunior = grade === 'g1' || grade === 'g2'
    this.setData({ canNext: !!(grade && (isJunior || goal) && q1 && q3 && examDate) })
  },

  onNext() {
    if (!this.data.examDate) {
      wx.showToast({ title: '请选择竞赛日期', icon: 'none' })
      return
    }
    if (!this.data.canNext) return
    const { q1, q3 } = this.data
    const answers: IntakeAnswers = {
      experience: q1 as IntakeAnswers['experience'],
      hardestTopic: '' as IntakeAnswers['hardestTopic'],
      weeklyHours: q3 as IntakeAnswers['weeklyHours'],
      confidence: '' as IntakeAnswers['confidence'],
    }
    const app = getApp<{ globalData: AppGlobal }>()
    app.globalData.intakeAnswers = answers
    app.globalData.onboardingSetup = {
      grade: this.data.grade,
      examDate: this.data.examDate,
      examName: '华杯小学数学邀请赛',
      target: this.data.goal as CompetitionTarget,
    }
    wx.navigateTo({ url: '/pages/onboarding/assessment/index' })
  },
})
