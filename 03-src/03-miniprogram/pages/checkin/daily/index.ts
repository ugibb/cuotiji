import { calendarApi, assignmentsApi, uploadApi } from '../../../services/api'
import type { AppGlobal } from '../../../app'
import type { TrainingPlan, PlanItem } from '../../../types/index'

interface AssignmentListItem {
  id: number
  chapterId: number
  planDate: string
  imageUrl: string
  status: 'ocr_pending' | 'ocr_done' | 'grading' | 'graded' | 'reviewed'
  correctCount: number
  wrongCount: number
  unknownCount: number
  createdAt: string
}

type SlotStatus = 'pending' | 'uploading' | 'grading' | 'graded' | 'mismatch' | 'error'

interface ProblemSlot {
  seq: number
  planItemId: number
  questionText: string
  status: SlotStatus
  thumbUrl: string
  assignmentId: number
  result?: 'correct' | 'wrong' | 'unknown'
  rawOcrText?: string
  studentAnswer?: string
  correctAnswer?: string
}

interface DailyCheckinData {
  statusBarHeight: number
  date: string
  dateLabel: string
  chapterId: number
  chapterName: string
  topic: string
  slots: ProblemSlot[]
  currentIndex: number
  submittedCount: number
  totalCount: number
  isLast: boolean
  canSubmit: boolean
  loading: boolean
}

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

Page<DailyCheckinData, Record<string, unknown>>({
  data: {
    statusBarHeight: 0,
    date: '',
    dateLabel: '',
    chapterId: 0,
    chapterName: '',
    topic: '',
    slots: [],
    currentIndex: 0,
    submittedCount: 0,
    totalCount: 0,
    isLast: false,
    canSubmit: false,
    loading: true,
  },

  onLoad(options: Record<string, string | undefined>) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const date = options.date || ''
    const chapterId = Number(options.chapterId || 0)
    const chapterName = decodeURIComponent(options.chapterName || '')
    const d = new Date(date)
    const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日 · ${WEEKDAY[d.getDay()]}`
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 44,
      date,
      dateLabel,
      chapterId,
      chapterName,
    })
    this.loadPlan(date, chapterId)
  },

  async loadPlan(date: string, chapterId: number) {
    try {
      const app = getApp<{ globalData: AppGlobal }>()
      const student = app.globalData.currentStudent
      if (!student) return

      const d = new Date(date)
      const res = await calendarApi.get(d.getFullYear(), d.getMonth() + 1, student.id)
      if (res.success && res.data) {
        const plan = res.data.plans.find((p: TrainingPlan) => p.planDate === date)
        // 优先用 planItems（含真题题目），没有则降级到 keyPoints 文字描述
        const planItems: PlanItem[] = plan?.planItems ?? []
        const keyPoints: string[] = plan?.keyPoints ?? []
        const count = Math.max(planItems.length, keyPoints.length)
        const slots: ProblemSlot[] = Array.from({ length: count }, (_, i) => ({
          seq: i + 1,
          planItemId: planItems[i]?.id ?? 0,
          questionText: planItems[i]?.question?.stemLatex ?? keyPoints[i] ?? `练习 ${i + 1}`,
          status: 'pending' as SlotStatus,
          thumbUrl: '',
          assignmentId: 0,
        }))
        this.setData({
          topic: plan?.topic ?? '',
          slots,
          totalCount: slots.length,
          isLast: slots.length <= 1,
        })
        // 恢复本日已上传的进度，避免部分打卡后重进页面从头开始
        await this.restoreProgress(date, chapterId, student.id)
      }
    } catch (err) {
      console.error('loadPlan error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async restoreProgress(date: string, chapterId: number, studentId: number) {
    try {
      const listRes = await assignmentsApi.list(studentId)
      if (!listRes.success || !listRes.data) return

      // 过滤出当天当章的 assignments，按创建时间升序（对应 slot 顺序）
      const existing = (listRes.data.assignments as unknown as AssignmentListItem[])
        .filter(a => a.planDate === date && a.chapterId === chapterId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

      if (existing.length === 0) return

      const slots = (this.data.slots as ProblemSlot[]).map((slot: ProblemSlot, i: number) => {
        const a = existing[i]
        if (!a) return slot

        if (a.status === 'graded' || a.status === 'reviewed') {
          const result: 'correct' | 'wrong' | 'unknown' =
            a.correctCount > 0 ? 'correct' : a.wrongCount > 0 ? 'wrong' : 'unknown'
          return { ...slot, status: 'graded' as SlotStatus, assignmentId: a.id, thumbUrl: a.imageUrl, result }
        }

        if (a.status === 'ocr_pending' || a.status === 'ocr_done' || a.status === 'grading') {
          this.pollSlotResult(slot.seq, a.id)
          return { ...slot, status: 'grading' as SlotStatus, assignmentId: a.id, thumbUrl: a.imageUrl }
        }

        return slot
      })

      this.setData({ slots })
      this.recomputeProgress()
    } catch (err) {
      console.error('restoreProgress error:', err)
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onSwiperChange(e: WechatMiniprogram.SwiperChange) {
    const idx = e.detail.current
    this.setData({ currentIndex: idx, isLast: idx === this.data.totalCount - 1 })
  },

  onPrev() {
    const idx = Math.max(0, this.data.currentIndex - 1)
    this.setData({ currentIndex: idx, isLast: idx === this.data.totalCount - 1 })
  },

  onNext() {
    const { currentIndex, totalCount } = this.data
    const idx = Math.min(totalCount - 1, currentIndex + 1)
    this.setData({ currentIndex: idx, isLast: idx === totalCount - 1 })
  },

  onTakePhoto(e: WechatMiniprogram.BaseEvent) {
    const { seq } = e.currentTarget.dataset as { seq: number }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.updateSlot(seq, { status: 'uploading', thumbUrl: tempFilePath })
        this.handleUpload(seq, tempFilePath)
      },
    })
  },

  async handleUpload(seq: number, tempFilePath: string) {
    try {
      const app = getApp<{ globalData: AppGlobal }>()
      const student = app.globalData.currentStudent!
      const { date, chapterId } = this.data

      const presignRes = await uploadApi.presign(`daily-${date}-seq${seq}-${Date.now()}.jpg`)
      if (!presignRes.success || !presignRes.data) throw new Error('获取上传地址失败')
      const { uploadUrl, fileUrl } = presignRes.data

      await new Promise<void>((resolve, reject) => {
        wx.uploadFile({
          url: uploadUrl,
          filePath: tempFilePath,
          name: 'file',
          success: () => resolve(),
          fail: reject,
        })
      })

      const slot = (this.data.slots as ProblemSlot[]).find((s: ProblemSlot) => s.seq === seq)
      const res = await assignmentsApi.create({
        chapterId,
        planDate: date,
        imageUrl: fileUrl,
        studentId: student.id,
        questionText: slot?.questionText,
      })

      if (!res.success || !res.data) throw new Error(res.error || '提交失败')

      const { assignmentId } = res.data
      const contentMismatch = (res.data as unknown as { contentMismatch?: boolean }).contentMismatch ?? false

      if (contentMismatch) {
        this.updateSlot(seq, { status: 'mismatch', assignmentId, thumbUrl: tempFilePath })
        wx.showToast({ title: '内容与题目不符，请重拍', icon: 'none', duration: 2500 })
      } else {
        this.updateSlot(seq, { status: 'grading', assignmentId, thumbUrl: tempFilePath })
        this.pollSlotResult(seq, assignmentId)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败'
      wx.showToast({ title: msg, icon: 'none' })
      this.updateSlot(seq, { status: 'error', thumbUrl: '' })
    }
    this.recomputeProgress()
  },

  updateSlot(seq: number, patch: Partial<ProblemSlot>) {
    const slots = (this.data.slots as ProblemSlot[]).map((s: ProblemSlot) =>
      s.seq === seq ? { ...s, ...patch } : s
    )
    this.setData({ slots })
  },

  pollSlotResult(seq: number, assignmentId: number) {
    let attempts = 0
    const MAX = 30
    const poll = () => {
      attempts++
      if (attempts > MAX) return
      assignmentsApi.get(assignmentId).then((res) => {
        if (res.success && res.data) {
          const { status, problems } = res.data as { status: string; problems?: Array<{ result: string; rawOcrText?: string; studentAnswer?: string; correctAnswer?: string }> }
          if (status === 'graded' || status === 'reviewed') {
            const p = problems?.[0]
            // thumbUrl 保持 tempFilePath，不换成 HTTP 的服务端 URL
            this.updateSlot(seq, {
              status: 'graded',
              result: (p?.result as 'correct' | 'wrong' | 'unknown') ?? 'unknown',
              rawOcrText: p?.rawOcrText ?? '',
              studentAnswer: p?.studentAnswer ?? '',
              correctAnswer: p?.correctAnswer ?? '',
            })
            this.recomputeProgress()
            return
          }
        }
        setTimeout(poll, 2000)
      }).catch(() => { setTimeout(poll, 3000) })
    }
    setTimeout(poll, 1500)
  },

  recomputeProgress() {
    const slots = this.data.slots as ProblemSlot[]
    const submittedCount = slots.filter((s: ProblemSlot) => s.status === 'graded').length
    const canSubmit = slots.length > 0 && slots.every(
      (s: ProblemSlot) => s.status === 'graded' || s.status === 'mismatch'
    )
    this.setData({ submittedCount, canSubmit })
  },

  onSubmit() {
    if (!this.data.canSubmit) return
    const { date, chapterName } = this.data
    wx.navigateTo({
      url: `/pages/checkin/summary/index?date=${date}&chapterName=${encodeURIComponent(chapterName)}`,
    })
  },
})
