// Core domain types for the miniprogram

export interface UserInfo {
  id: number
  openid: string
  nickname: string
  parentPhone?: string
}

export interface Student {
  id: number
  userId: number
  name: string
  grade: number
  avatar?: string
  isDefault: boolean
}

export interface Chapter {
  id: number
  code: string
  name: string
  subtitle?: string
  grade: number
  sortOrder: number
  isActive: boolean
}

export interface PlanItemQuestion {
  id: number
  stemLatex: string
  options: { label: string; text: string }[]
  answerLatex: string
}

export interface PlanItem {
  id: number
  seq: number
  questionId: number | null
  question?: PlanItemQuestion | null
}

export interface TrainingPlan {
  id: number
  studentId: number
  project: string
  chapterId: number
  planDate: string
  topic?: string
  keyPoints?: string[]
  chapter?: Chapter
  assignmentStatus?: 'not_uploaded' | 'uploaded_pending' | 'completed'
  planItems?: PlanItem[]
}

export interface Problem {
  id: number
  assignmentId: number
  seq: number
  ocrText?: string
  studentAnswer?: string
  correctAnswer?: string
  result: 'correct' | 'wrong' | 'unknown'
  knowledgePoint?: string
  trapDesc?: string
  solutionText?: string
  rootCause?: string
  reviewStatus: 'pending' | 'done'
  reviewStage?: number
  reviewStageName?: string
}

export interface Assignment {
  id: number
  studentId: number
  chapterId: number
  planDate: string
  imageUrl: string
  imageUrlThumb?: string
  status: 'ocr_pending' | 'ocr_done' | 'grading' | 'graded' | 'reviewed'
  totalCount: number
  correctCount: number
  wrongCount: number
  unknownCount: number
  moodText?: string
  problems: Problem[]
}

export interface Dialogue {
  id: number
  problemId: number
  role: 'ai' | 'student'
  content: string
  imageUrl?: string | null
  stageCode?: string | null
  createdAt: string
}

// API response wrapper
export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
  meta?: {
    total?: number
    page?: number
    limit?: number
  }
}

export interface ReviewProblem {
  id: number
  seq: number
  ocrText?: string
  correctAnswer?: string
  result: 'correct' | 'wrong' | 'unknown'
  knowledgePoint?: string
  trapDesc?: string
  solutionText?: string
  rootCause?: string
  reviewStage: number
  nextReviewAt?: string | null
}

export interface WeakPoint {
  chapterId: number
  chapterName: string
  chapterCode: string
  totalWrong: number
  recentWrong: number
  weaknessScore: number
  lastWrongDate: string
}

export interface SprintPlan {
  id: number
  studentId: number
  subject: string
  examDate: string
  daysLeft: number
  createdAt: string
}

// Calendar day status
export type DayStatus = 'no_plan' | 'not_uploaded' | 'uploaded_pending' | 'done' | 'planned'

export interface CalendarDay {
  date: string
  status: DayStatus
  plan?: TrainingPlan
  day?: number
  isToday?: boolean
  hasPlan?: boolean
  isPast?: boolean
  circleClass?: string
  numClass?: string
  underlineClass?: string
}

// ─── Onboarding / Setup Types ───────────────────────────────────────────────

export type CompetitionTarget = 'entry' | 'award' | 'top'
export type StudyExperience = 'none' | 'lt1' | '1to2' | 'gt2'
export type HardestTopic = 'number_theory' | 'travel' | 'geometry' | 'all_same'
export type WeeklyHours = 'lt30min' | '30to60min' | '1to2h' | 'gt2h'
export type ConfidenceLevel = 'zero' | 'some' | 'confident'

export interface OnboardingSetup {
  grade: string              // '四年级' | '五年级' | '六年级' | '其他'
  examDate: string           // 'YYYY-MM-DD'
  examName: string           // '华杯小学数学邀请赛'
  target: CompetitionTarget
}

export interface IntakeAnswers {
  experience: StudyExperience
  hardestTopic: HardestTopic
  weeklyHours: WeeklyHours
  confidence: ConfidenceLevel
}

// Assessment question option
export interface QuestionOption {
  label: string
  text: string
}

// Assessment question
export interface AssessmentQuestion {
  id: number
  topic: string
  topicColor: 'blue' | 'amber' | 'green' | 'purple' | 'teal' | 'rose'
  question: string
  options: QuestionOption[]
  correctOption: string // 'A' | 'B' | 'C' | 'D'
}

// Per-domain score in ability report
export interface DomainScore {
  name: string
  score: number
  status: 'strong' | 'medium' | 'weak'
  desc: string
}

// Ability report generated after assessment
export interface AbilityReport {
  level: '初级' | '中级' | '高级'
  levelChar: string
  totalScore: number
  levelDesc: string
  domains: DomainScore[]
  radarPoints: string // SVG polygon points for data polygon
}

// Milestone in the plan
export interface Milestone {
  id: string               // 'M1' | 'M2' | 'M3'
  title: string
  dateRange: string
  dayRange: string
  tags: string[]
  tagColor: 'blue' | 'amber' | 'green'
  goal: string
  status: 'active' | 'pending' | 'done'
  progress?: number        // 0-100
  completedDays?: number
  totalDays?: number
}

// Active sprint plan (extended)
export interface ActiveSprintPlan extends SprintPlan {
  grade?: string
  target?: CompetitionTarget
  currentMilestone?: string
  currentMilestoneDay?: number
  currentMilestoneTotalDays?: number
  milestoneProgress?: number
  todayTopic?: string
  todayEstMin?: number
  todayProblemCount?: number
  streakDays?: number
  totalErrors?: number
  milestones?: Milestone[]
}

// Recent practice record shown on home page
export interface RecentPractice {
  topic: string
  date: string
  totalCount: number
  correctCount: number
  wrongCount: number
}
