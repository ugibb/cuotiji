// Port of assessment-data.ts buildAbilityReport logic — runs server-side
// Input: array of question records + student answer map

export interface QuestionRecord {
  id: number | bigint
  topic: string        // e.g. "整除 · 余数"
  correctOption: string // "A" | "B" | "C" | "D"
}

export interface DomainScore {
  name: string
  score: number
  status: 'strong' | 'medium' | 'weak'
  desc: string
}

export interface AbilityReport {
  level: '初级' | '中级' | '高级'
  levelChar: string
  totalScore: number
  levelDesc: string
  domains: DomainScore[]
  radarPoints: string
}

const TOPIC_COLORS: Record<string, string> = {
  '整除·余数': 'blue',
  '整除 · 余数': 'blue',
  '行程·速度': 'amber',
  '行程 · 速度': 'amber',
  '计数·规律': 'green',
  '计数 · 规律': 'green',
  '鸡兔同笼': 'purple',
  '数列·规律': 'teal',
  '数列 · 规律': 'teal',
  '应用综合': 'rose',
}

export function topicColor(topic: string): string {
  return TOPIC_COLORS[topic] ?? 'blue'
}

function normalizeTopic(topic: string): string {
  return topic.replace(/\s*·\s*/g, '')
}

function domainStatus(score: number): DomainScore['status'] {
  if (score >= 80) return 'strong'
  if (score >= 60) return 'medium'
  return 'weak'
}

function buildDomainDesc(score: number, status: DomainScore['status']): string {
  if (status === 'weak') return `正确率 ${score}%，建议优先突破`
  if (status === 'medium') return `正确率 ${score}%，有基础需强化`
  return `正确率 ${score}%，掌握良好可深化`
}

function levelFromScore(total: number): Pick<AbilityReport, 'level' | 'levelChar'> {
  if (total >= 80) return { level: '高级', levelChar: '高' }
  if (total >= 55) return { level: '中级', levelChar: '中' }
  return { level: '初级', levelChar: '初' }
}

function buildLevelDesc(totalScore: number, domains: DomainScore[]): string {
  const focus = domains
    .filter((d) => d.status === 'weak' || d.status === 'medium')
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)

  if (focus.length === 0) {
    return totalScore >= 70 ? '各板块掌握良好，可挑战进阶内容' : '整体均衡，继续保持练习节奏'
  }

  const names = focus.map((d) => d.name)
  const prefix = totalScore >= 70 ? '有扎实基础' : totalScore >= 50 ? '基础不错' : '建议先夯实基础'
  return `${prefix}，${names.join(' · ')} 是关键突破点`
}

export function buildAbilityReport(
  questions: QuestionRecord[],
  answers: Record<string, string>,
): AbilityReport {
  const topicOrder: string[] = []
  const byTopic = new Map<string, { correct: number; total: number }>()

  for (const q of questions) {
    const id = String(q.id)
    if (!topicOrder.includes(q.topic)) topicOrder.push(q.topic)
    const stat = byTopic.get(q.topic) ?? { correct: 0, total: 0 }
    stat.total += 1
    if (answers[id] === q.correctOption) stat.correct += 1
    byTopic.set(q.topic, stat)
  }

  const domains: DomainScore[] = topicOrder.map((topic) => {
    const { correct, total } = byTopic.get(topic)!
    const score = Math.round((correct / total) * 100)
    const status = domainStatus(score)
    return {
      name: normalizeTopic(topic),
      score,
      status,
      desc: buildDomainDesc(score, status),
    }
  })

  const totalCorrect = questions.filter((q) => answers[String(q.id)] === q.correctOption).length
  const totalScore = Math.round((totalCorrect / (questions.length || 1)) * 100)
  const { level, levelChar } = levelFromScore(totalScore)

  return {
    level,
    levelChar,
    totalScore,
    levelDesc: buildLevelDesc(totalScore, domains),
    domains,
    radarPoints: '',
  }
}

export function buildAiOpeningMsg(report: AbilityReport): string {
  const { domains, totalScore } = report
  if (domains.length === 0) {
    return '完成诊断测试后，我会根据你的作答给出能力画像。有什么想补充的吗？'
  }

  const sorted = [...domains].sort((a, b) => a.score - b.score)
  const weakOnes = sorted.filter((d) => d.status === 'weak')
  const focus = weakOnes.length > 0 ? weakOnes : sorted.filter((d) => d.status === 'medium')

  if (focus.length === 0) {
    return `根据你的作答（综合分 ${totalScore}），各板块掌握都不错。有没有觉得某块被低估或高估了？`
  }

  const primary = focus[0]
  if (focus.length === 1) {
    return `根据你的作答，我判断${primary.name}（正确率 ${primary.score}%）是你的主要短板。有没有觉得不准确的地方？`
  }

  const secondary = focus[1]
  return `根据你的作答，${primary.name}（${primary.score}%）和 ${secondary.name}（${secondary.score}%）相对薄弱。有没有觉得不准确的地方？`
}
