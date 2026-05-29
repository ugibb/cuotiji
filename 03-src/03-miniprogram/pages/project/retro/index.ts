interface RetroPageData {
  mastery: string
  intent: string
}

Page<RetroPageData, Record<string, unknown>>({
  data: {
    mastery: '78',
    intent: 'next',
  },

  onMastery(e: WechatMiniprogram.BaseEvent) {
    const v = (e.currentTarget.dataset as { v: string }).v
    this.setData({ mastery: v })
  },

  onIntent(e: WechatMiniprogram.BaseEvent) {
    const v = (e.currentTarget.dataset as { v: string }).v
    this.setData({ intent: v })
  },

  onContinue() {
    wx.navigateBack()
  },
})
