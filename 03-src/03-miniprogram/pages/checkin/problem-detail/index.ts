import { Problem, Dialogue } from '../../../types/index'
import { api } from '../../../services/api'

const recorderManager = wx.getRecorderManager()

interface ProblemDetailPageData {
  problem: Problem | null
  dialogues: Dialogue[]
  loading: boolean
  sending: boolean
  recording: boolean
  dots: string
  hintText: string
  total: number
  problemId: number
  statusBarHeight: number
  safeAreaBottom: number
  scrollAnchor: string
}

const HINT_MAP: Record<string, string> = {
  wrong: '对着麦克风说出你的解题思路',
  correct: '说说你的解题思路，看和 AI 是否一致',
  unknown: '跟着 AI 的问题，说出你的思考'
}

let dotTimer: ReturnType<typeof setInterval> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Page<ProblemDetailPageData, any>({
  data: {
    problem: null,
    dialogues: [],
    loading: true,
    sending: false,
    recording: false,
    dots: '.',
    hintText: '',
    total: 0,
    problemId: 0,
    statusBarHeight: 44,
    safeAreaBottom: 34,
    scrollAnchor: ''
  },

  onLoad(options: Record<string, string | undefined>) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 44,
      safeAreaBottom: (sysInfo as { safeAreaInsets?: { bottom?: number } }).safeAreaInsets?.bottom ?? 34,
      problemId: Number(options?.problemId || 0),
      total: Number(options?.total || 0)
    })

    this.setupRecorder()
    this.loadProblem()
    this.loadDialogues()
  },

  onUnload() {
    if (dotTimer) clearInterval(dotTimer)
  },

  setupRecorder() {
    recorderManager.onStop((res) => {
      this.handleVoiceStop(res.tempFilePath)
    })
    recorderManager.onError(() => {
      this.setData({ recording: false })
      wx.showToast({ title: '录音失败', icon: 'none' })
    })
  },

  async loadProblem() {
    const { problemId } = this.data
    if (!problemId) return
    try {
      const res = await api.get<Problem>(`/problems/${problemId}`)
      if (res.success && res.data) {
        const hintText = HINT_MAP[res.data.result] || ''
        this.setData({ problem: res.data, hintText })
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

  onSpeakStart() {
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ recording: true })
        recorderManager.start({ format: 'mp3', sampleRate: 16000, duration: 60000 })
      },
      fail: () => {
        wx.showModal({
          title: '需要麦克风权限',
          content: '请在设置中开启麦克风权限，才能使用语音功能',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting()
          }
        })
      }
    })
  },

  onSpeakEnd() {
    if (!this.data.recording) return
    this.setData({ recording: false })
    recorderManager.stop()
  },

  onSpeakCancel() {
    if (!this.data.recording) return
    this.setData({ recording: false })
    recorderManager.stop()
    wx.showToast({ title: '已取消', icon: 'none' })
  },

  async handleVoiceStop(tempFilePath: string) {
    const { problemId, dialogues } = this.data

    const studentMsg: Dialogue = {
      id: Date.now(),
      problemId,
      role: 'student',
      content: '🎤 [语音消息]',
      createdAt: new Date().toISOString()
    }
    this.setData({ dialogues: [...dialogues, studentMsg], sending: true })
    this.startDots()
    this.scrollToBottom()

    try {
      const app = getApp<{ globalData: { baseUrl: string; token: string | null } }>()
      const token = app.globalData.token || ''

      await new Promise<void>((resolve, reject) => {
        wx.uploadFile({
          url: `${app.globalData.baseUrl}/api/problems/${problemId}/voice-dialogue`,
          filePath: tempFilePath,
          name: 'voice',
          header: { Authorization: `Bearer ${token}` },
          success: (res) => {
            try {
              const data = JSON.parse(res.data) as {
                success: boolean
                data?: { aiReply: Dialogue }
              }
              if (data.success && data.data?.aiReply) {
                this.setData({ dialogues: [...this.data.dialogues, data.data.aiReply] })
                this.scrollToBottom()
              }
              resolve()
            } catch {
              reject(new Error('parse error'))
            }
          },
          fail: reject
        })
      })
    } catch {
      wx.showToast({ title: '发送失败，请重试', icon: 'none' })
    } finally {
      this.stopDots()
      this.setData({ sending: false })
    }
  },

  startDots() {
    let count = 0
    dotTimer = setInterval(() => {
      count = (count + 1) % 4
      this.setData({ dots: '.'.repeat(count + 1) })
    }, 400)
  },

  stopDots() {
    if (dotTimer) {
      clearInterval(dotTimer)
      dotTimer = null
    }
    this.setData({ dots: '.' })
  },

  scrollToBottom() {
    this.setData({ scrollAnchor: '' }, () => {
      this.setData({ scrollAnchor: 'bottom-anchor' })
    })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  }
})
