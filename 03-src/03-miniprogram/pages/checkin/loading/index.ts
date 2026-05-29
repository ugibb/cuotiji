import { assignmentsApi } from '../../../services/api'

interface StepItem {
  id: number
  label: string
  status: 'done' | 'active' | 'pending'
}

interface LoadingPageData {
  assignmentId: number | null
  chapterName: string
  step: string
  steps: StepItem[]
  totalQuestions: number
  dots: string
  statusBarHeight: number
  safeAreaBottom: number
}

let pollTimer: ReturnType<typeof setTimeout> | null = null
let dotTimer: ReturnType<typeof setInterval> | null = null
let pollCount = 0
const MAX_POLL = 60

let wsTask: WechatMiniprogram.SocketTask | null = null
let wsConnected = false

type PageInst = WechatMiniprogram.Page.Instance<LoadingPageData, Record<string, unknown>>

// 根据后端状态推导步骤列表
function buildSteps(status: string, totalQuestions: number): StepItem[] {
  const qStr = totalQuestions > 0 ? `，共 ${totalQuestions} 道题` : ''

  const configs: Array<{ doneLabel: string; activeLabel: string; pendingLabel: string }> = [
    {
      doneLabel: `图片识别完成${qStr}`,
      activeLabel: '正在识别图片...',
      pendingLabel: '图片识别'
    },
    {
      doneLabel: '题目解析完成',
      activeLabel: '正在解析题目...',
      pendingLabel: '题目解析'
    },
    {
      doneLabel: '逐题批改完成',
      activeLabel: '正在逐题批改',
      pendingLabel: '逐题批改'
    },
    {
      doneLabel: '错误归因分析完成',
      activeLabel: '正在生成归因分析',
      pendingLabel: '生成错误归因分析'
    }
  ]

  let activeIdx = 0
  if (status === 'ocr_pending') activeIdx = 0
  else if (status === 'ocr_done') activeIdx = 1
  else if (status === 'grading') activeIdx = 2
  else if (status === 'graded' || status === 'reviewed') activeIdx = 4

  return configs.map((cfg, i) => {
    let itemStatus: 'done' | 'active' | 'pending'
    let label: string
    if (i < activeIdx) {
      itemStatus = 'done'
      label = cfg.doneLabel
    } else if (i === activeIdx) {
      itemStatus = 'active'
      label = cfg.activeLabel
    } else {
      itemStatus = 'pending'
      label = cfg.pendingLabel
    }
    return { id: i + 1, label, status: itemStatus }
  })
}

function startDotAnimation(page: PageInst) {
  let count = 0
  dotTimer = setInterval(() => {
    count = (count + 1) % 4
    page.setData({ dots: '·'.repeat(count + 1) })
  }, 500)
}

function handleGraded(page: PageInst) {
  const { assignmentId, chapterName } = page.data
  if (dotTimer) clearInterval(dotTimer)
  setTimeout(() => {
    wx.redirectTo({
      url: `/pages/checkin/summary/index?assignmentId=${assignmentId}&chapterName=${encodeURIComponent(chapterName)}`
    })
  }, 800)
}

function applyStatus(page: PageInst, status: string, totalQuestions?: number) {
  const total = totalQuestions ?? page.data.totalQuestions
  const steps = buildSteps(status, total)
  page.setData({ step: status, steps, totalQuestions: total })
  if (status === 'graded' || status === 'reviewed') {
    handleGraded(page)
  }
}

// ── WebSocket ──────────────────────────────────────────────────────────────

function connectWebSocket(page: PageInst) {
  const { assignmentId } = page.data
  if (!assignmentId) return

  const app = getApp<{ globalData: { token: string | null; baseUrl: string } }>()
  const token = app.globalData.token
  if (!token) {
    startPolling(page)
    return
  }

  const wsUrl = app.globalData.baseUrl
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:')
  const url = `${wsUrl}/api/ws/assignment/${assignmentId}?token=${token}`

  wsTask = wx.connectSocket({
    url,
    success: () => { /* initiated */ },
    fail: () => {
      wsTask = null
      startPolling(page)
    }
  })

  if (!wsTask) {
    startPolling(page)
    return
  }

  wsTask.onOpen(() => { wsConnected = true })

  wsTask.onMessage((event) => {
    try {
      const msg = JSON.parse(event.data as string) as {
        type: string
        status?: string
        totalQuestions?: number
      }
      if (msg.type === 'progress' && msg.status) {
        applyStatus(page, msg.status, msg.totalQuestions)
      } else if (msg.type === 'error') {
        closeWebSocket()
        startPolling(page)
      }
    } catch { /* ignore malformed */ }
  })

  wsTask.onClose(() => {
    wsConnected = false
    wsTask = null
    const { step } = page.data
    if (step !== 'graded' && step !== 'reviewed') {
      startPolling(page)
    }
  })

  wsTask.onError(() => {
    wsConnected = false
    wsTask = null
    startPolling(page)
  })

  setTimeout(() => {
    if (!wsConnected) {
      closeWebSocket()
      startPolling(page)
    }
  }, 5000)
}

function closeWebSocket() {
  if (wsTask) {
    try { wsTask.close({}) } catch { /* ignore */ }
    wsTask = null
  }
  wsConnected = false
}

// ── 轮询兜底 ────────────────────────────────────────────────────────────────

function pollAssignmentStatus(page: PageInst) {
  const { assignmentId } = page.data
  if (!assignmentId) return

  pollCount += 1
  if (pollCount > MAX_POLL) {
    onTimeout(page)
    return
  }

  assignmentsApi.get(assignmentId).then((res) => {
    if (!res.success || !res.data) {
      pollTimer = setTimeout(() => pollAssignmentStatus(page), 2000)
      return
    }
    applyStatus(page, res.data.status)
    if (res.data.status !== 'graded' && res.data.status !== 'reviewed') {
      pollTimer = setTimeout(() => pollAssignmentStatus(page), 2000)
    }
  }).catch(() => {
    pollTimer = setTimeout(() => pollAssignmentStatus(page), 3000)
  })
}

function startPolling(page: PageInst) {
  if (pollTimer) return
  pollCount = 0
  pollAssignmentStatus(page)
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function onTimeout(page: PageInst) {
  if (dotTimer) clearInterval(dotTimer)
  wx.showModal({
    title: '批改中',
    content: '批改需要更多时间，可以先返回，稍后在日历点击查看结果',
    showCancel: false,
    confirmText: '好的',
    success: () => { wx.navigateBack({ delta: 3 }) }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Page<LoadingPageData, any>({
  data: {
    assignmentId: null,
    chapterName: '',
    step: 'ocr_pending',
    steps: buildSteps('ocr_pending', 0),
    totalQuestions: 0,
    dots: '·',
    statusBarHeight: 44,
    safeAreaBottom: 34
  },

  onLoad(options: Record<string, string | undefined>) {
    const assignmentId = Number(options?.assignmentId || 0)

    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const statusBarHeight = sysInfo.statusBarHeight || 44
    // safeAreaInsets.bottom available in newer SDKs
    const safeAreaBottom = (sysInfo as { safeAreaInsets?: { bottom?: number } }).safeAreaInsets?.bottom ?? 34

    const chapterName = decodeURIComponent(options?.chapterName || '')
    this.setData({ assignmentId, chapterName, statusBarHeight, safeAreaBottom })

    pollCount = 0
    wsConnected = false
    startDotAnimation(this as unknown as PageInst)
    connectWebSocket(this as unknown as PageInst)
  },

  onSkip() {
    const { assignmentId, chapterName } = this.data
    stopPolling()
    closeWebSocket()
    if (dotTimer) clearInterval(dotTimer)
    wx.redirectTo({
      url: `/pages/checkin/summary/index?assignmentId=${assignmentId}&chapterName=${encodeURIComponent(chapterName)}`
    })
  },

  onUnload() {
    stopPolling()
    if (dotTimer) clearInterval(dotTimer)
    closeWebSocket()
  }
})
