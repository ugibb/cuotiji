import axios from 'axios'
import { STAGE_CODE, ReviewStageValue } from '../constants/review-stages'

export type ProblemResult = 'correct' | 'wrong' | 'unknown'

export interface GradeResult {
  result: ProblemResult
  studentAnswer: string
  correctAnswer: string
  knowledgePoint: string
  trapDesc: string
  solutionText: string
  rootCause: string | null
}

export interface DialogueHistoryItem {
  role: 'ai' | 'student'
  content: string
  imageUrl?: string | null
}

export interface ProblemForDialogue {
  ocrText: string | null
  studentAnswer: string | null
  correctAnswer: string | null
  result: string
  knowledgePoint: string | null
  trapDesc: string | null
  solutionText: string | null
  rootCause: string | null
}

export interface ReviewReplyResult {
  reply: string
  stageComplete: boolean
  suggestNext: boolean
}

// ── 模型路由 ───────────────────────────────────────────────────────────────────

type AiRegion = 'domestic' | 'international'

function getRegion(): AiRegion {
  return (process.env.AI_REGION as AiRegion) || 'domestic'
}

// ── Grading（始终用 Claude，批改对模型要求不涉及视觉） ─────────────────────────

const GRADING_SYSTEM_PROMPT = `你是一个专业的小学奥数批改助手。

你会收到：
- 题目文字（已知，来自题库）
- 手写识别文本（OCR 从学生手写作答图片提取的原始文字）

你需要：
1. 从手写识别文本中，提取学生的最终答案（去除解题过程，只留答案部分）
2. 判断答案是否正确（correct / wrong / unknown）
   - 若 OCR 文本为空或完全无法识别，标记为 unknown
3. 给出正确答案
4. 识别涉及的知识点（精确到具体方法）
5. 指出这道题设置的陷阱（"坑"）
6. 给出简洁的解题思路
7. 若答案错误，给出初步错误归因（不超过2句话）

注意：OCR 可能有识别噪音（字迹潦草、数字相似），请合理容错推断学生意图。

输出格式（只输出JSON，不要有其他内容）：
{
  "student_answer": "鸡12只，兔23只",
  "result": "wrong",
  "correct_answer": "鸡12只，兔8只",
  "knowledge_point": "鸡兔同笼·列方程法",
  "trap_desc": "鸡是2只脚，兔是4只脚，系数容易搞反",
  "solution_text": "设鸡x只，兔y只：x+y=20，2x+4y=56，解得x=12",
  "root_cause": "你把鸡兔的脚数系数写反了，2x+4y应为正确列法"
}`

async function callClaudeApi(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your-anthropic-api-key') {
    await new Promise(resolve => setTimeout(resolve, 200))
    return getMockAiResponse(userMessage)
  }

  const messages = [
    ...conversationHistory,
    { role: 'user' as const, content: userMessage }
  ]

  const response = await axios.post<{
    content: Array<{ type: string; text: string }>
  }>(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    }
  )

  const content = response.data.content.find(c => c.type === 'text')
  return content?.text || ''
}

// ── 复盘对话的多模态 API 路由 ──────────────────────────────────────────────────

type MessageContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>

interface ChatMessage {
  role: 'user' | 'assistant'
  content: MessageContent
}

function buildUserContent(text: string, imageUrl?: string | null): MessageContent {
  if (!imageUrl) return text
  return [
    { type: 'image_url', image_url: { url: imageUrl } },
    { type: 'text', text },
  ]
}

async function callReviewApi(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const region = getRegion()

  if (region === 'domestic') {
    return callQwenVL(systemPrompt, messages)
  }
  return callClaudeSonnet(systemPrompt, messages)
}

async function callQwenVL(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY
  if (!apiKey || apiKey === 'your-dashscope-api-key') {
    await new Promise(resolve => setTimeout(resolve, 300))
    return getMockReviewJson()
  }

  const response = await axios.post<{
    choices: Array<{ message: { content: string } }>
  }>(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      model: 'qwen-vl-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      max_tokens: 1024,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
    }
  )

  return response.data.choices[0]?.message?.content || ''
}

async function callClaudeSonnet(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your-anthropic-api-key') {
    await new Promise(resolve => setTimeout(resolve, 300))
    return getMockReviewJson()
  }

  // Convert OpenAI-style image_url to Claude's image format
  const claudeMessages = messages.map(m => ({
    role: m.role,
    content: convertToClaudeContent(m.content)
  }))

  const response = await axios.post<{
    content: Array<{ type: string; text: string }>
  }>(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    }
  )

  const content = response.data.content.find(c => c.type === 'text')
  return content?.text || ''
}

function convertToClaudeContent(
  content: MessageContent
): string | Array<{ type: string; [key: string]: unknown }> {
  if (typeof content === 'string') return content
  return content.map(c => {
    if (c.type === 'image_url') {
      return {
        type: 'image',
        source: { type: 'url', url: c.image_url.url }
      }
    }
    return c
  })
}

// ── Review System Prompts ──────────────────────────────────────────────────────

function buildProblemContext(problem: ProblemForDialogue): string {
  const lines = [
    `题目内容：${problem.ocrText || '（未知）'}`,
    `学生作答：${problem.studentAnswer || '（未作答）'}`,
    `正确答案：${problem.correctAnswer || '（未知）'}`,
    `知识点：${problem.knowledgePoint || '（未知）'}`,
  ]
  if (problem.result === 'wrong' || problem.result === 'unknown') {
    if (problem.trapDesc) lines.push(`坑点：${problem.trapDesc}`)
    if (problem.solutionText) lines.push(`标准解法：${problem.solutionText}`)
  }
  if (problem.result === 'wrong' && problem.rootCause) {
    lines.push(`错误归因：${problem.rootCause}`)
  }
  return lines.join('\n')
}

const STAGE_TASK: Record<string, string> = {
  PROBE_THINKING: '请引导学生说出自己解题时的思路和步骤。不要评价对错，只是先让学生自己说出来。每次只问一个问题。',
  VERIFY_DEPTH: '学生已说出解法。现在请通过追问，验证学生是否真正理解这道题背后的知识点（为什么这样做、换一个数字还会不会做）。',
  EXPLORE_VARIANTS: '学生已理解解法。现在引导学生发散思考：是否有更简洁的解法？如果题目条件变化，思路会怎样改变？',
  IDENTIFY_ERROR: '学生已说出解题思路。现在引导学生自己找出错误点在哪里。不要直接告知，而是通过对比正确步骤，让学生自己发现。',
  ROOT_CAUSE: '学生已找到错误点。现在帮助学生做错误归因分析：这是哪个知识点掌握不牢固？以后遇到类似题目需要注意什么？',
  GUIDE_READING: '学生不会做这道题。从"读题"开始引导：让学生找出题目中所有的已知条件，一条条说出来。',
  IDENTIFY_KNOWLEDGE: '学生已读完题目。现在帮助学生判断：这是什么类型的题？需要用什么方法？涉及哪个知识点？',
  GUIDED_SOLVING: '学生已知道解题方法。现在按标准解题步骤，一步一步引导学生自己完成计算，每一步让学生说出结果后再继续。',
  COMPLETE: '复盘已完成。给学生一个简短的总结（1-2句），肯定他这次复盘的收获，然后提示他可以进入下一题了。',
}

function buildReviewSystemPrompt(
  problem: ProblemForDialogue,
  stageCode: string,
  turnCount: number
): string {
  const task = STAGE_TASK[stageCode] || '继续引导学生完成复盘。'
  const isComplete = stageCode === 'COMPLETE'

  return `你是一位专业的奥数辅导老师，正在用苏格拉底式对话引导学生完成答题复盘。

【题目信息】
${buildProblemContext(problem)}
答题结果：${problem.result === 'correct' ? '答对' : problem.result === 'wrong' ? '答错' : '不会'}

【当前复盘阶段】${stageCode}
【本阶段已对话轮次】${turnCount} 轮（每阶段上限 5 轮，超出将自动推进）

【本阶段任务】
${task}

【输出要求】
必须返回合法 JSON，格式如下，不要输出任何 JSON 以外的内容：
{
  "reply": "对学生说的话（自然语言，不超过100字）",
  "stageComplete": ${isComplete ? 'true' : 'false 或 true（你判断本阶段目标已达成则为 true）'},
  "suggestNext": ${isComplete ? 'true' : 'false'}
}

注意：
- reply 是说给学生听的，语气亲切，避免说教
- stageComplete 为 true 时，服务端将自动推进到下一阶段
- suggestNext 只有在 COMPLETE 阶段且已完成总结后才设为 true`
}

function buildOpeningSystemPrompt(problem: ProblemForDialogue): string {
  const resultDesc =
    problem.result === 'correct' ? '答对了' : problem.result === 'wrong' ? '答错了' : '不会做'

  return `你是一位亲切的奥数辅导老师，即将开始引导学生复盘一道题。

【题目信息】
${buildProblemContext(problem)}
答题结果：${resultDesc}

【任务】
生成一句自然的复盘开场白（1-2句，不超过60字），目的是开启对话，让学生愿意开口说说自己的解题思路。
- 如果答对了：肯定+引导分享思路
- 如果答错了：安慰+好奇心引导
- 如果不会做：鼓励+邀请一起看题

只输出开场白文本本身，不加任何前缀或解释。`
}

// ── Mock helpers ───────────────────────────────────────────────────────────────

function getMockAiResponse(input: string): string {
  if (input.includes('OCR文本') || input.includes('学生答案')) {
    const answers = [
      JSON.stringify({
        result: 'wrong',
        correct_answer: '鸡12只，兔8只',
        knowledge_point: '鸡兔同笼·列方程法',
        trap_desc: '头和脚的数量关系容易混淆，注意鸡2脚兔4脚',
        solution_text: '设鸡x只，兔y只：x+y=20，2x+4y=56，解方程组得x=12，y=8',
        root_cause: '列方程时混淆了鸡和兔的脚数，应注意鸡是2只脚'
      }),
      JSON.stringify({
        result: 'correct',
        correct_answer: '5050',
        knowledge_point: '等差数列·高斯求和公式',
        trap_desc: '直接逐个相加太慢，要想到首尾配对的方法',
        solution_text: '(1+100)×100÷2 = 5050',
        root_cause: null
      }),
    ]
    return answers[Math.floor(Math.random() * answers.length)]
  }
  const dialogueResponses = [
    '你好！让我们一起来看看这道题。你先告诉我，你是怎么理解题目意思的？',
    '很好的思路！那你觉得题目给了我们哪些已知条件呢？',
    '对！你说得对。那根据这些条件，你觉得第一步应该怎么做？',
  ]
  return dialogueResponses[Math.floor(Math.random() * dialogueResponses.length)]
}

function getMockReviewJson(): string {
  return JSON.stringify({
    reply: '很好！你能说说你当时是怎么想到这个解法的吗？',
    stageComplete: false,
    suggestNext: false
  })
}

function getMockMoodText(stats: { total: number; correct: number; wrong: number; unknown: number; chapter: string }): string {
  const accuracy = stats.total > 0 ? stats.correct / stats.total : 0
  if (accuracy >= 0.8) {
    return `太棒了！这次${stats.chapter}练习答对了${stats.correct}道，正确率很高！继续保持这份专注，你在奥数上的进步越来越明显了。`
  } else if (accuracy >= 0.5) {
    return `这次${stats.chapter}练习答对了${stats.correct}道题，不错的表现！${stats.wrong + stats.unknown}道错题是提升的宝贵机会，来一起弄懂它们吧！`
  } else {
    return `${stats.chapter}这个章节比较难，这次答对了${stats.correct}道。没关系，通过今天的错题复盘，你一定能更好地掌握这些知识点！`
  }
}

// ── 公开方法 ───────────────────────────────────────────────────────────────────

async function gradeProblems(
  knownQuestion: string,
  rawOcrText: string,
  chapterName: string
): Promise<GradeResult> {
  const userMessage = `题目章节：${chapterName}\n\n【题目文字】\n${knownQuestion || '（未提供）'}\n\n【手写识别文本】\n${rawOcrText || '（识别结果为空）'}`
  const responseText = await callClaudeApi(GRADING_SYSTEM_PROMPT, userMessage)

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0]) as {
      student_answer: string
      result: string
      correct_answer: string
      knowledge_point: string
      trap_desc: string
      solution_text: string
      root_cause: string | null
    }
    return {
      studentAnswer: parsed.student_answer || rawOcrText.slice(0, 256),
      result: (parsed.result as ProblemResult) || 'unknown',
      correctAnswer: parsed.correct_answer || '',
      knowledgePoint: parsed.knowledge_point || '',
      trapDesc: parsed.trap_desc || '',
      solutionText: parsed.solution_text || '',
      rootCause: parsed.root_cause || null
    }
  } catch {
    return { studentAnswer: rawOcrText.slice(0, 256), result: 'unknown', correctAnswer: '', knowledgePoint: chapterName, trapDesc: '', solutionText: '', rootCause: null }
  }
}

async function generateReviewOpening(problem: ProblemForDialogue): Promise<string> {
  const systemPrompt = buildOpeningSystemPrompt(problem)
  const region = getRegion()

  if (region === 'domestic') {
    const apiKey = process.env.DASHSCOPE_API_KEY
    if (!apiKey || apiKey === 'your-dashscope-api-key') {
      const openings: Record<string, string> = {
        correct: '你答对了！来说说你是怎么想到的？',
        wrong: '这道题做错了没关系，先告诉我你当时是怎么理解题目的？',
        unknown: '这道题不会做很正常，我们一起来看，先读读题目，说说你看到了哪些条件？'
      }
      return openings[problem.result] || openings['unknown']
    }
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey === 'your-anthropic-api-key') {
      const openings: Record<string, string> = {
        correct: '你答对了！来说说你是怎么想到的？',
        wrong: '这道题做错了没关系，先告诉我你当时是怎么理解题目的？',
        unknown: '这道题不会做很正常，我们一起来看，先读读题目，说说你看到了哪些条件？'
      }
      return openings[problem.result] || openings['unknown']
    }
  }

  const messages: ChatMessage[] = [{ role: 'user', content: '请生成开场白。' }]
  return callReviewApi(systemPrompt, messages)
}

async function generateReviewReply(params: {
  problem: ProblemForDialogue
  stageCode: string
  studentMessage: string
  imageUrl?: string | null
  history: DialogueHistoryItem[]
  turnCount: number
}): Promise<ReviewReplyResult> {
  const { problem, stageCode, studentMessage, imageUrl, history, turnCount } = params
  const systemPrompt = buildReviewSystemPrompt(problem, stageCode, turnCount)

  const messages: ChatMessage[] = history.map(h => ({
    role: h.role === 'ai' ? ('assistant' as const) : ('user' as const),
    content: h.imageUrl ? buildUserContent(h.content, h.imageUrl) : h.content
  }))
  messages.push({
    role: 'user',
    content: buildUserContent(studentMessage, imageUrl)
  })

  const raw = await callReviewApi(systemPrompt, messages)

  try {
    const jsonMatch = raw.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) throw new Error('No JSON')
    const parsed = JSON.parse(jsonMatch[0]) as {
      reply: string
      stageComplete: boolean
      suggestNext: boolean
    }
    return {
      reply: parsed.reply || raw,
      stageComplete: Boolean(parsed.stageComplete),
      suggestNext: Boolean(parsed.suggestNext)
    }
  } catch {
    return { reply: raw, stageComplete: false, suggestNext: false }
  }
}

async function generateDialogueReply(
  problem: ProblemForDialogue,
  studentMessage: string,
  history: DialogueHistoryItem[]
): Promise<string> {
  const stageCode = 'PROBE_THINKING'
  const result = await generateReviewReply({
    problem,
    stageCode,
    studentMessage,
    history,
    turnCount: history.length
  })
  return result.reply
}

async function generateMoodText(stats: {
  total: number
  correct: number
  wrong: number
  unknown: number
  chapter: string
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your-anthropic-api-key') {
    return getMockMoodText(stats)
  }

  const prompt = `根据以下成绩，生成一段鼓励性文案（2-3句话），要：
- 肯定做对的部分
- 对错题/不会的题给出有期待感的描述
- 语气像一个欣赏孩子的老师，不能过于夸张
- 不超过60字

成绩：章节${stats.chapter}，共${stats.total}题，答对${stats.correct}题，答错${stats.wrong}题，不会${stats.unknown}题`

  return callClaudeApi('你是一位温暖的小学奥数辅导老师。', prompt)
}

export const aiService = {
  gradeProblems,
  generateDialogueReply,
  generateReviewOpening,
  generateReviewReply,
  generateMoodText
}

export { ReviewStageValue }
