import { ApiResponse } from '../types/index'

function getGlobalData() {
  const app = getApp() as unknown as { globalData: { token: string | null; baseUrl: string } }
  return app.globalData
}

function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  data?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  return new Promise((resolve, reject) => {
    const gd = getGlobalData()
    const token = gd.token
    const baseUrl = gd.baseUrl

    wx.request({
      url: `${baseUrl}${path}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success: (res) => {
        resolve(res.data as ApiResponse<T>)
      },
      fail: (err) => {
        reject(err)
      }
    })
  })
}

function buildQuery(params: Record<string, unknown>): string {
  const parts: string[] = []
  const keys = Object.keys(params)
  for (const key of keys) {
    parts.push(`${key}=${params[key]}`)
  }
  return parts.length > 0 ? '?' + parts.join('&') : ''
}

export const api = {
  get<T>(path: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const query = params ? buildQuery(params) : ''
    return request<T>(`${path}${query}`, 'GET')
  },

  post<T>(path: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return request<T>(path, 'POST', data)
  },

  put<T>(path: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return request<T>(path, 'PUT', data)
  },

  delete<T>(path: string): Promise<ApiResponse<T>> {
    return request<T>(path, 'DELETE')
  }
}

// Specific API calls
export const authApi = {
  login(code: string) {
    return api.post<{ token: string; user: { id: number; nickname: string } }>(
      '/auth/login',
      { code }
    )
  }
}

export const studentsApi = {
  list() {
    return api.get<{ students: import('../types/index').Student[] }>('/students')
  }
}

export const calendarApi = {
  get(year: number, month: number, studentId: number) {
    return api.get<{ plans: import('../types/index').TrainingPlan[] }>(
      '/calendar',
      { year, month, studentId }
    )
  }
}

export const chaptersApi = {
  list() {
    return api.get<{ chapters: import('../types/index').Chapter[] }>('/chapters')
  }
}

export const assignmentsApi = {
  create(data: { chapterId: number; planDate: string; imageUrl: string; studentId: number }) {
    return api.post<{ assignmentId: number; status: string }>('/assignments/upload', data as unknown as Record<string, unknown>)
  },

  get(id: number) {
    return api.get<import('../types/index').Assignment>(`/assignments/${id}`)
  },

  list(studentId: number) {
    return api.get<{ assignments: import('../types/index').Assignment[] }>(
      '/assignments',
      { studentId }
    )
  }
}

export const uploadApi = {
  presign(filename: string) {
    return api.post<{ uploadUrl: string; fileUrl: string }>('/upload/presign', { filename })
  }
}

export const analyticsApi = {
  weakpoints(studentId: number, timeRange: 'all' | 'week' | 'month' = 'all', limit = 5) {
    return api.get<{
      weakpoints: import('../types/index').WeakPoint[]
      totalWrong: number
      hasEnoughData: boolean
    }>('/analytics/weakpoints', { studentId, timeRange, limit })
  },

  chapterProblems(studentId: number, chapterId: number) {
    return api.get<{ problems: import('../types/index').Problem[] }>(
      '/analytics/chapter-problems',
      { studentId, chapterId }
    )
  }
}

export const sprintApi = {
  create(data: { studentId: number; subject: string; examDate: string }) {
    return api.post<import('../types/index').SprintPlan>('/sprint-plans', data as unknown as Record<string, unknown>)
  },

  active(studentId: number) {
    return api.get<{ plans: import('../types/index').SprintPlan[] }>(
      '/sprint-plans/active',
      { studentId }
    )
  },

  problems(planId: number, studentId: number, page = 1, limit = 20) {
    return api.get<{ problems: import('../types/index').ReviewProblem[] }>(
      `/sprint-plans/${planId}/problems`,
      { studentId, page, limit }
    )
  },

  deletePlan(planId: number) {
    return api.delete<{ deleted: boolean }>(`/sprint-plans/${planId}`)
  }
}

export const reviewStreakApi = {
  get(studentId: number) {
    return api.get<{ streak: number; lastCheckDate: string | null }>(
      '/review/streak',
      { studentId }
    )
  }
}

export const intakeApi = {
  questions() {
    return api.get<{ questions: import('../types/index').AssessmentQuestion[] }>(
      '/intake/questions'
    )
  },
  submit(studentId: number, answers: Record<string, string>) {
    return api.post<{ report: import('../types/index').AbilityReport; aiOpeningMsg: string }>(
      `/intake/submit/${studentId}`,
      { answers } as unknown as Record<string, unknown>
    )
  },
  report(studentId: number) {
    return api.get<{ report: import('../types/index').AbilityReport; aiOpeningMsg: string }>(
      `/intake/report/${studentId}`
    )
  },
}

export const trainingPlansApi = {
  get(studentId: number, year: number, month: number) {
    return api.get<{ plans: import('../types/index').TrainingPlan[] }>(
      '/training-plans',
      { studentId, year, month }
    )
  },
  generate(data: { studentId: number; examDate?: string; competitionName?: string }) {
    return api.post<{ sprintPlanId: number; milestones: unknown[] }>(
      '/training-plans/generate',
      data as unknown as Record<string, unknown>
    )
  },
  milestones(studentId: number) {
    return api.get<{ milestones: import('../types/index').Milestone[] }>(
      `/milestones/${studentId}`
    )
  },
}
