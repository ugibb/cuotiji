/**
 * 补填脚本：为现有 stu_training_plans 创建 stu_training_plan_items
 *
 * 前提：plans 已存在（131 条），plan_items 为空，knl_questions 只有 15 道评测题
 * 执行：npx ts-node prisma/populate-plan-items.ts
 * 幂等：重复执行安全，已有 planItems 的计划会跳过
 */

import prisma from '../src/utils/prisma'

// ─── C01 整除与余数 练习题（9 道） ─────────────────────────────────────────────

interface PracticeQ {
  stem: string
  answer: string
}

const C01_QUESTIONS: PracticeQ[] = [
  {
    stem: '一个数除以 6 余 5，除以 4 余 3，满足条件的最小正整数是多少？',
    answer: '11',
  },
  {
    stem: '1 到 100 中，能被 4 整除但不能被 6 整除的数共有几个？',
    answer: '17',
  },
  {
    stem: '若 a 除以 7 余 3，b 除以 7 余 5，则 a×b 除以 7 余几？',
    answer: '1',
  },
  {
    stem: '某班学生人数在 30 到 50 之间，5 人一组恰好分完，6 人一组多 2 人，这班共有多少学生？',
    answer: '50',
  },
  {
    stem: '2^1 + 2^2 + 2^3 + … + 2^10 除以 7 的余数是多少？',
    answer: '2',
  },
  {
    stem: '一个整数除以 11 余 7，则它的 3 倍除以 11 余几？',
    answer: '10',
  },
  {
    stem: '甲、乙两数之和为 47，甲除以乙商 2 余 5，则乙是多少？',
    answer: '14',
  },
  {
    stem: '一堆糖，每次取 3 粒剩 2 粒，每次取 5 粒剩 4 粒，每次取 7 粒剩 6 粒，这堆糖最少有几粒？',
    answer: '104',
  },
  {
    stem: '一个三位数除以 9 余 1，除以 11 余 2，这个三位数最小是多少？',
    answer: '145',
  },
]

// ─── C02 行程与速度 练习题（9 道） ─────────────────────────────────────────────

const C02_QUESTIONS: PracticeQ[] = [
  {
    stem: '甲乙两地相距 240 千米，甲以 60 千米/时、乙以 40 千米/时相向而行，几小时后相遇？',
    answer: '2.4小时',
  },
  {
    stem: '一条船顺流速度 20 千米/时，逆流速度 12 千米/时，水流速度是多少千米/时？',
    answer: '4千米/时',
  },
  {
    stem: '一项工程甲单独完成需 15 天，乙单独完成需 10 天，两人合作几天完成？',
    answer: '6天',
  },
  {
    stem: '一列长 180 米的火车以 90 千米/时的速度通过一座 270 米长的桥，需要几秒？',
    answer: '18秒',
  },
  {
    stem: '甲乙两人绕 600 米环形跑道同向出发，甲速 8 米/秒，乙速 6 米/秒，甲第一次追上乙需几秒？',
    answer: '300秒',
  },
  {
    stem: '甲从 A 地、乙从 B 地同时相向而行，甲速是乙速的 1.5 倍，甲到达 B 地时乙距 A 地还有 20 千米，AB 相距多少千米？',
    answer: '60千米',
  },
  {
    stem: '原计划 30 人用 60 天完成一项工程，开工 20 天后增加 10 人，剩余工程还需几天完成？',
    answer: '30天',
  },
  {
    stem: '一段路步行需 3 小时，骑车需 1 小时，先步行 30 分钟再骑车，共需多少分钟到达？',
    answer: '80分钟',
  },
  {
    stem: '甲乙两人从 A、B 两地同时相向出发，甲速 60 米/分，乙速 40 米/分，AB 相距 500 米，第二次相遇时甲距 A 地多少米？',
    answer: '100米',
  },
]

// ─── 工具：upsert 练习题，返回 ID 列表 ────────────────────────────────────────

async function upsertQuestions(questions: PracticeQ[]): Promise<bigint[]> {
  const ids: bigint[] = []
  for (const q of questions) {
    const existing = await prisma.knl_Question.findFirst({
      where: { stemLatex: q.stem },
      select: { id: true },
    })
    if (existing) {
      ids.push(existing.id)
    } else {
      const created = await prisma.knl_Question.create({
        data: {
          grade: 5,
          difficulty: 3,
          stemLatex: q.stem,
          answerLatex: q.answer,
        },
        select: { id: true },
      })
      ids.push(created.id)
    }
  }
  return ids
}

// ─── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('─'.repeat(50))
  console.log('📚 步骤 1：写入练习题到 knl_questions...')

  const c01Ids = await upsertQuestions(C01_QUESTIONS)
  console.log(`  ✓ C01 整除与余数：${c01Ids.length} 道 [ids: ${c01Ids.join(', ')}]`)

  const c02Ids = await upsertQuestions(C02_QUESTIONS)
  console.log(`  ✓ C02 行程与速度：${c02Ids.length} 道 [ids: ${c02Ids.join(', ')}]`)

  const questionIdsBychapterId: Record<number, bigint[]> = {
    1: c01Ids,
    2: c02Ids,
  }

  console.log('\n📋 步骤 2：为现有计划补填 planItems...')

  const plans = await prisma.stu_TrainingPlan.findMany({
    where: { chapterId: { in: [1, 2] } },
    select: {
      id: true,
      chapterId: true,
      keyPoints: true,
      _count: { select: { planItems: true } },
    },
    orderBy: { planDate: 'asc' },
  })

  const toFill = plans.filter((p) => p._count.planItems === 0)
  const skipped = plans.length - toFill.length

  console.log(`  计划总数：${plans.length}，已有 planItems 跳过：${skipped}，待补填：${toFill.length}`)

  let filled = 0
  for (const plan of toFill) {
    const questionIds = questionIdsBychapterId[plan.chapterId ?? 0]
    if (!questionIds || questionIds.length === 0) continue

    const keyPoints = (plan.keyPoints as string[] | null) ?? []
    const count = keyPoints.length > 0 ? keyPoints.length : 3

    await prisma.stu_TrainingPlanItem.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        planId: plan.id,
        questionId: questionIds[i % questionIds.length],
        orderNum: i,
        itemType: 'new_practice',
      })),
    })
    filled++
  }

  console.log(`  ✓ 补填完成：${filled} 个计划，共 ${filled > 0 ? '~' : ''}${filled * 3} 条 planItems`)

  const finalCount = await prisma.stu_TrainingPlanItem.count()
  console.log(`\n  stu_training_plan_items 最终行数：${finalCount}`)
  console.log('─'.repeat(50))
  console.log('✅ 完成！')
}

main()
  .catch((e) => { console.error('❌ 失败:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
