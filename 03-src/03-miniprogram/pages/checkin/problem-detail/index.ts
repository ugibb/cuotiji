import { Problem, Dialogue } from '../../../types/index'
import { api } from '../../../services/api'

interface ProblemDetailPageData {
  problem: Problem | null
  dialogues: Dialogue[]
  loading: boolean
  sending: boolean
  reviewStarting: boolean
  dots: string
  hintText: string
  total: number
  problemId: number
  statusBarHeight: number
  safeAreaBottom: number
  scrollAnchor: string
  problemIds: string
  currentIndex: number
  totalInReview: number
  isReviewMode: boolean
  isLast: boolean
  assignmentId: number
  suggestNext: boolean
  reviewDone: boolean
  scrollViewHeight: number
}

const HINT_MAP: Record<string, string> = {
  wrong: '对着麦克风说出你的解题思路',
  correct: '说说你的解题思路，看和 AI 是否一致',
  unknown: '跟着 AI 的问题，说出你的思考'
}

let dotTimer: ReturnType<typeof setInterval> | null = null
let touchStartX = 0
let touchStartY = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Page<ProblemDetailPageData, any>({
  data: {
    problem: null,
    dialogues: [],
    loading: true,
    sending: false,
    reviewStarting: false,
    dots: '.',
    hintText: '',
    total: 0,
    problemId: 0,
    statusBarHeight: 44,
    safeAreaBottom: 34,
    scrollAnchor: '',
    problemIds: '',
    currentIndex: 0,
    totalInReview: 0,
    isReviewMode: false,
    isLast: false,
    assignmentId: 0,
    suggestNext: false,
    reviewDone: false,
    scrollViewHeight: 600,
  },

  async onLoad(options: Record<string, string | undefined>) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()

    const problemIds = options?.problemIds || ''
    const currentIndex = Number(options?.currentIndex ?? -1)
    const assignmentId = Number(options?.assignmentId || 0)
    const isReviewMode = !!problemIds && currentIndex >= 0
    const ids = problemIds ? problemIds.split(',') : []
    const totalInReview = ids.length
    const isLast = isReviewMode && currentIndex === totalInReview - 1

    const statusBarHeight = sysInfo.statusBarHeight || 44
    const safeAreaBottom = (sysInfo as { safeAreaInsets?: { bottom?: number } }).safeAreaInsets?.bottom ?? 34
    const navBarPx = 44
    const chatBarPx = Math.ceil(104 * sysInfo.windowWidth / 750) + safeAreaBottom
    const scrollViewHeight = sysInfo.windowHeight - statusBarHeight - navBarPx - chatBarPx

    this.setData({
      statusBarHeight,
      safeAreaBottom,
      scrollViewHeight,
      problemId: Number(options?.problemId || 0),
      total: Number(options?.total || 0),
      problemIds,
      currentIndex,
      assignmentId,
      isReviewMode,
      totalInReview,
      isLast
    })

    await this.loadProblem()
    await this.loadDialogues()

    // 复盘模式 + 无历史对话 → AI 自动开场
    if (isReviewMode && this.data.dialogues.length === 0 && !this.data.reviewDone) {
      await this.startReview()
    }
  },

  onUnload() {
    if (dotTimer) clearInterval(dotTimer)
  },

  async loadProblem() {
    const { problemId } = this.data
    if (!problemId) return
    try {
      const res = await api.get<Problem>(`/problems/${problemId}`)
      if (res.success && res.data) {
        const hintText = HINT_MAP[res.data.result] || ''
        const reviewDone = res.data.reviewStatus === 'done'
        this.setData({ problem: res.data, hintText, reviewDone })
      }
    } catch (err) {
      console.error('loadProblem error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadDialogues() {
    const { problemId } = this.data
    if (!problemId) return
    try {
      const res = await api.get<{ dialogues: Dialogue[] }>(`/problems/${problemId}/dialogues`)
      if (res.success && res.data) {
        this.setData({ dialogues: res.data.dialogues })
        this.scrollToBottom()
      }
    } catch (err) {
      console.error('loadDialogues error:', err)
    }
  },

  async startReview() {
    const { problemId } = this.data
    this.setData({ reviewStarting: true })
    try {
      const res = await api.post<{ message: string; dialogue: Dialogue }>(
        `/problems/${problemId}/review-start`,
        {}
      )
      if (res.success && res.data?.dialogue) {
        this.setData({ dialogues: [res.data.dialogue] })
        this.scrollToBottom()
      }
    } catch (err) {
      console.error('startReview error:', err)
    } finally {
      this.setData({ reviewStarting: false })
    }
  },

  onChatSend(e: WechatMiniprogram.CustomEvent<{ type: 'text' | 'voice' | 'image'; content?: string; filePath?: string; imageUrl?: string }>) {
    const { type, content, filePath, imageUrl } = e.detail
    if (type === 'text' && content) {
      this.handleTextSend(content)
    } else if (type === 'voice' && filePath) {
      this.handleVoiceStop(filePath)
    } else if (type === 'image' && imageUrl) {
      this.handleImageSend(imageUrl)
    }
  },

  onVoiceEnd(e: WechatMiniprogram.CustomEvent<{ filePath: string }>) {
    this.handleVoiceStop(e.detail.filePath)
  },

  onChatCamera() {
    if (this.data.reviewDone) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const filePath = res.tempFiles[0]?.tempFilePath
        if (filePath) this.uploadAndSendImage(filePath)
      },
    })
  },

  onChatPlus() {
    if (this.data.reviewDone) return
    wx.showActionSheet({
      itemList: ['相册', '拍摄'],
      success: (res) => {
        const sourceType = res.tapIndex === 0
          ? (['album'] as ('album' | 'camera')[])
          : (['camera'] as ('album' | 'camera')[])
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType,
          success: (media) => {
            const filePath = media.tempFiles[0]?.tempFilePath
            if (filePath) this.uploadAndSendImage(filePath)
          },
        })
      },
    })
  },

  async uploadAndSendImage(filePath: string) {
    const { problemId } = this.data
    const app = getApp<{ globalData: { baseUrl: string; token: string | null } }>()
    const token = app.globalData.token || ''
    wx.showLoading({ title: '上传中…' })
    try {
      await new Promise<void>((resolve, reject) => {
        wx.uploadFile({
          url: `${app.globalData.baseUrl}/api/problems/${problemId}/chat-image`,
          filePath,
          name: 'file',
          header: { Authorization: `Bearer ${token}` },
          success: (res) => {
            try {
              const data = JSON.parse(res.data) as { success: boolean; data?: { imageUrl: string } }
              if (data.success && data.data?.imageUrl) {
                resolve()
                this.handleImageSend(data.data.imageUrl)
              } else {
                reject(new Error('upload failed'))
              }
            } catch { reject(new Error('parse error')) }
          },
          fail: reject,
        })
      })
    } catch {
      wx.showToast({ title: '上传失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async handleImageSend(imageUrl: string) {
    const { problemId, dialogues } = this.data
    const studentMsg: Dialogue = {
      id: Date.now(), problemId, role: 'student',
      content: '', imageUrl, createdAt: new Date().toISOString(),
    }
    this.setData({ dialogues: [...dialogues, studentMsg], sending: true })
    this.startDots()
    this.scrollToBottom()
    try {
      const res = await api.post<{ aiReply: Dialogue; suggestNext?: boolean }>(
        `/problems/${problemId}/dialogue`,
        { content: '', imageUrl }
      )
      if (!res.success) {
        this.setData({ dialogues })
        wx.showToast({ title: res.error || '发送失败，请重试', icon: 'none' })
        return
      }
      if (res.data?.aiReply) {
        const isComplete = res.data.suggestNext ?? false
        this.setData({
          dialogues: [...this.data.dialogues, res.data.aiReply],
          suggestNext: isComplete,
          reviewDone: isComplete,
        })
        this.scrollToBottom()
      }
    } catch {
      this.setData({ dialogues })
      wx.showToast({ title: '发送失败，请重试', icon: 'none' })
    } finally {
      this.stopDots()
      this.setData({ sending: false })
    }
  },

  async handleTextSend(text: string) {
    const { problemId, dialogues } = this.data
    const studentMsg: Dialogue = {
      id: Date.now(), problemId, role: 'student',
      content: text, createdAt: new Date().toISOString(),
    }
    this.setData({ dialogues: [...dialogues, studentMsg], sending: true })
    this.startDots()
    this.scrollToBottom()
    try {
      const res = await api.post<{ aiReply: Dialogue; suggestNext?: boolean }>(
        `/problems/${problemId}/dialogue`,
        { content: text }
      )
      if (!res.success) {
        // 移除刚刚乐观添加的学生消息，还原对话列表
        this.setData({ dialogues })
        wx.showToast({ title: res.error || '发送失败，请重试', icon: 'none' })
        return
      }
      if (res.data?.aiReply) {
        const isComplete = this.data.isReviewMode && (res.data.suggestNext ?? false)
        this.setData({
          dialogues: [...this.data.dialogues, res.data.aiReply],
          suggestNext: isComplete,
          reviewDone: isComplete,
        })
        this.scrollToBottom()
      }
    } catch {
      this.setData({ dialogues })
      wx.showToast({ title: '发送失败，请重试', icon: 'none' })
    } finally {
      this.stopDots()
      this.setData({ sending: false })
    }
  },

  async handleVoiceStop(tempFilePath: string) {
    const app = getApp<{ globalData: { baseUrl: string; token: string | null } }>()
    const token = app.globalData.token || ''
    const chatInput = this.selectComponent('#chat-input-comp') as { fillText: (t: string) => void; resetVoice: (m?: string) => void } | null
    wx.uploadFile({
      url: `${app.globalData.baseUrl}/stt`,
      filePath: tempFilePath,
      name: 'audio',
      header: { Authorization: `Bearer ${token}` },
      success: (res) => {
        try {
          const parsed = JSON.parse(res.data) as { success: boolean; data?: { text: string }; error?: string }
          if (parsed.success && parsed.data?.text) {
            chatInput?.fillText(parsed.data.text)
          } else {
            chatInput?.resetVoice(parsed.error || '识别失败，请重试')
          }
        } catch {
          chatInput?.resetVoice('识别失败，请重试')
        }
      },
      fail: () => {
        chatInput?.resetVoice('网络异常，请重试')
      },
    })
  },

  previewImage(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset['url'] as string
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
  },

  startDots() {
    let count = 0
    dotTimer = setInterval(() => {
      count = (count + 1) % 4
      this.setData({ dots: '.'.repeat(count + 1) })
    }, 400)
  },

  stopDots() {
    if (dotTimer) { clearInterval(dotTimer); dotTimer = null }
    this.setData({ dots: '.' })
  },

  scrollToBottom() {
    this.setData({ scrollAnchor: '' }, () => {
      this.setData({ scrollAnchor: 'bottom-anchor' })
    })
  },

  onTouchStart(e: WechatMiniprogram.TouchEvent) {
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
  },

  onTouchEnd(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.isReviewMode) return
    const dx = e.changedTouches[0].clientX - touchStartX
    const dy = e.changedTouches[0].clientY - touchStartY
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0) {
      this.data.isLast ? wx.showToast({ title: '已经是最后一题了', icon: 'none' }) : this.onNext()
    } else {
      this.data.currentIndex === 0 ? wx.showToast({ title: '已经是第一题了', icon: 'none' }) : this.onPrev()
    }
  },

  onPrev() {
    const { problemIds, currentIndex, assignmentId } = this.data
    if (currentIndex <= 0) return
    const ids = problemIds.split(',').filter(Boolean)
    const prevId = ids[currentIndex - 1]
    wx.redirectTo({
      url: `/pages/checkin/problem-detail/index?problemId=${prevId}&problemIds=${problemIds}&currentIndex=${currentIndex - 1}&assignmentId=${assignmentId}`
    })
  },

  onNext() {
    const { problemIds, currentIndex, assignmentId } = this.data
    const ids = problemIds.split(',').filter(Boolean)
    const nextIndex = currentIndex + 1
    if (nextIndex >= ids.length) {
      wx.redirectTo({ url: `/pages/checkin/review-done/index?assignmentId=${assignmentId}` })
      return
    }
    const nextId = ids[nextIndex]
    wx.redirectTo({
      url: `/pages/checkin/problem-detail/index?problemId=${nextId}&problemIds=${problemIds}&currentIndex=${nextIndex}&assignmentId=${assignmentId}`
    })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  }
})
