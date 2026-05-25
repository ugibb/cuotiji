const EXAM_DATE = '2026-11-20'

function calcDaysLeft(): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const exam = new Date(EXAM_DATE)
  const diff = exam.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / 86400000))
}

Page({
  data: {
    daysLeft: 0,
    statusBarHeight: 0,
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync()
    this.setData({ daysLeft: calcDaysLeft(), statusBarHeight })
  },

  onStart() {
    wx.navigateTo({ url: '/pages/intake/index' })
  },
})
