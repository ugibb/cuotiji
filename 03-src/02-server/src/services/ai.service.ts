// We call Claude API directly via axios to minimize dependencies in Sprint 0
// Production: can switch to @anthropic-ai/sdk if installed
import axios from 'axios'

export type ProblemResult = 'correct' | 'wrong' | 'unknown'

export interface GradeResult {
  result: ProblemResult
  correctAnswer: string
  knowledgePoint: string
  trapDesc: string
  solutionText: string
  rootCause: string | null
}

export interface DialogueHistoryItem {
  role: 'ai' | 'student'
  content: string
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

const GRADING_SYSTEM_PROMPT = `你是一个专业的小学奥数批改助手。

给定一道题目的OCR文本和学生答案，你需要：
1. 判断答案是否正确（correct / wrong / unknown）
2. 给出正确答案
3. 识别涉及的知识点（精确到具体方法）
4. 指出这道题设置的陷阱（"坑"）
5. 给出简洁的解题思路
6. 若答案错误，给出初步错误归因（不超过2句话）

输出格式（只输出JSON，不要有其他内容）：
{
  "result": "wrong",
  "correct_answer": "鸡12只，兔8只",
  "knowledge_point": "鸡兔同笼·列方程法",
  "trap_desc": "鸡是2只脚，兔是4只脚，系数容易搞反",
  "solution_text": "设鸡x只，兔y只：x+y=20，2x+4y=56，解得x=12",
  "root_cause": "你把鸡兔的脚数系数写反了，2x+4y应为正确列法"
}`

function getDialogueSystemPrompt(problem: ProblemForDialogue): string {
  const problemDesc = `题目：${problem.ocrText || '（未知）'}
学生答案：${problem.studentAnswer || '（未作答）'}
正确答案：${problem.correctAnswer || '（未知）'}
知识点：${problem.knowledgePoint || '（未知）'}
解题思路：${problem.solutionText || '（未知）'}`

  if (problem.result === 'wrong') {
    return `你是一位有耐心的奥数辅导老师。学生做错了这道题。

${problemDesc}
错误归因：${problem.rootCause || '（待分析）'}

目标：引导学生说出自己的解题思路，帮助他自己发现错误所在。
规则：
- 不要直接告诉学生哪里错了，先问他是怎么想的
- 每次只问一个问题
- 当学生说出关键错误时，给予正向反馈，再指出问题
- 对话不超过6轮
- 语气友好鼓励，不批评`
  } else if (problem.result === 'unknown') {
    return `你是一位有耐心的奥数辅导老师。学生完全不会这道题。

${problemDesc}

目标：用苏格拉底式引导，让学生自己一步步推导出答案。
规则：
- 第一步永远是"读题"——引导学生找出题目中的已知条件
- 每次只问一个子问题，循序渐进
- 不要跳步骤，每个推理步骤都要学生自己说出来
- 最后由学生得出答案，你做总结归因`
  } else {
    return `你是一位奥数辅导老师。学生做对了这道题。

${problemDesc}

目标：帮助学生巩固解题思路，探索是否有更优方法。
规则：
- 先让学生说说自己的解法
- 对比 AI 的解法，指出异同
- 如有更简洁解法，引导学生理解，但不强求
- 语气轻松，以鼓励为主`
  }
}

async function callClaudeApi(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  // Mock mode when no API key configured
  if (!apiKey || apiKey === 'your-anthropic-api-key') {
    await new Promise(resolve => setTimeout(resolve, 200)) // simulate latency
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

function getMockAiResponse(input: string): string {
  // Mock grading response (JSON format)
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
      JSON.stringify({
        result: 'unknown',
        correct_answer: '36千米',
        knowledge_point: '行程问题·追及与相遇',
        trap_desc: '需要先找到甲乙相遇时的时间关系',
        solution_text: '设AB距离为d，甲速4，乙速3，在相遇点乙走了(d-5)千米',
        root_cause: null
      })
    ]
    return answers[Math.floor(Math.random() * answers.length)]
  }

  // Mock dialogue response
  const dialogueResponses = [
    '你好！让我们一起来看看这道题。你先告诉我，你是怎么理解题目意思的？',
    '很好的思路！那你觉得题目给了我们哪些已知条件呢？',
    '对！你说得对。那根据这些条件，你觉得第一步应该怎么做？',
    '嗯，你想到了用方程，这个思路很棒！那你打算设什么为未知数？',
    '厉害！你自己发现了！下次记住这个规律，做同类题就不会错了。',
    '继续加油！这类题的关键是找准数量关系。你现在理解了吗？'
  ]
  return dialogueResponses[Math.floor(Math.random() * dialogueResponses.length)]
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

async function gradeProblems(
  ocrText: string,
  studentAnswer: string,
  chapterName: string
): Promise<GradeResult> {
  const userMessage = `题目章节：${chapterName}
OCR文本：${ocrText}
学生答案：${studentAnswer || '（未作答）'}`

  const responseText = await callClaudeApi(GRADING_SYSTEM_PROMPT, userMessage)

  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    const parsed = JSON.parse(jsonMatch[0]) as {
      result: string
      correct_answer: string
      knowledge_point: string
      trap_desc: string
      solution_text: string
      root_cause: string | null
    }

    return {
      result: (parsed.result as ProblemResult) || 'unknown',
      correctAnswer: parsed.correct_answer || '',
      knowledgePoint: parsed.knowledge_point || '',
      trapDesc: parsed.trap_desc || '',
      solutionText: parsed.solution_text || '',
      rootCause: parsed.root_cause || null
    }
  } catch {
    // Fallback if parsing fails
    return {
      result: 'unknown',
      correctAnswer: '',
      knowledgePoint: chapterName,
      trapDesc: '',
      solutionText: '',
      rootCause: null
    }
  }
}

async function generateDialogueReply(
  problem: ProblemForDialogue,
  studentMessage: string,
  history: DialogueHistoryItem[]
): Promise<string> {
  const systemPrompt = getDialogueSystemPrompt(problem)

  // Convert history to Claude message format
  const conversationHistory = history.map(h => ({
    role: (h.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: h.content
  }))

  return callClaudeApi(systemPrompt, studentMessage, conversationHistory)
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
  generateMoodText
}
