import { AssessmentQuestion } from '../../types/index'

const QUESTIONS: AssessmentQuestion[] = [
  {
    id: 1,
    topic: '整除 · 余数',
    topicColor: 'blue',
    question: '一个整数除以 7 余 3，那么这个数除以 14 的余数可能是哪些？',
    options: [
      { label: 'A', text: '只能是 3' },
      { label: 'B', text: '只能是 10' },
      { label: 'C', text: '可能是 3，也可能是 10' },
      { label: 'D', text: '不确定，无法判断' },
    ],
    correctOption: 'C',
  },
  {
    id: 2,
    topic: '行程 · 速度',
    topicColor: 'amber',
    question: '甲乙两地相距 120 千米。一辆汽车从甲出发，速度 40 千米/时；另一辆从乙出发，速度 60 千米/时，两车相向而行，几小时后相遇？',
    options: [
      { label: 'A', text: '1 小时' },
      { label: 'B', text: '1.2 小时' },
      { label: 'C', text: '2 小时' },
      { label: 'D', text: '3 小时' },
    ],
    correctOption: 'B',
  },
  {
    id: 3,
    topic: '计数 · 规律',
    topicColor: 'green',
    question: '从 1 写到 100，数字「2」共出现了多少次？',
    options: [
      { label: 'A', text: '10 次' },
      { label: 'B', text: '20 次' },
      { label: 'C', text: '21 次' },
      { label: 'D', text: '22 次' },
    ],
    correctOption: 'B',
  },
]

interface AssessmentPageData {
  questions: AssessmentQuestion[]
  answers: Record<number, string>
  answered: number
  total: number
  submitting: boolean
}

Page<AssessmentPageData, Record<string, unknown>>({
  data: {
    questions: QUESTIONS,
    answers: {},
    answered: 0,
    total: 3,
    submitting: false,
  },

  onPick(e: WechatMiniprogram.BaseEvent) {
    const { qid, label } = e.currentTarget.dataset as { qid: number; label: string }
    const answers = { ...this.data.answers, [qid]: label }
    const answered = Object.keys(answers).length
    this.setData({ answers, answered })
  },

  onSubmit() {
    if (this.data.answered < 3 || this.data.submitting) return
    this.setData({ submitting: true })

    // Simulate AI analysis delay
    wx.showLoading({ title: 'AI 正在分析…' })
    setTimeout(() => {
      wx.hideLoading()
      // Store answers in globalData for report page
      const app = getApp<{ globalData: { assessmentAnswers: Record<number, string> | null } }>()
      app.globalData.assessmentAnswers = this.data.answers
      this.setData({ submitting: false })
      wx.navigateTo({ url: '/pages/report/index' })
    }, 1200)
  },
})
