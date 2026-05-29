// OCR Service - Mock implementation for development
// Production: replace recognizeProblems with Tencent Cloud OCR API calls

export interface OcrProblem {
  text: string
  studentAnswer: string
}

export interface OcrResult {
  problems: OcrProblem[]
}

// Mock data for different scenarios
const MOCK_PROBLEMS: OcrProblem[][] = [
  [
    {
      text: '一个班有男生24人，女生16人，男生比女生多几分之几？',
      studentAnswer: '24/16'
    },
    {
      text: '鸡兔同笼，共有头35个，脚94只，鸡、兔各有多少只？',
      studentAnswer: '鸡12只，兔23只'
    },
    {
      text: '甲乙两人同时从A地出发去B地，甲每小时走4千米，乙每小时走3千米，甲先到B地后立即返回，在途中遇到乙，此时乙离B地还有5千米，AB两地相距多少千米？',
      studentAnswer: '35'
    }
  ],
  [
    {
      text: '1到100所有自然数的和是多少？',
      studentAnswer: '5050'
    },
    {
      text: '一个长方形的周长是36厘米，长是宽的2倍，求长方形的面积。',
      studentAnswer: '72平方厘米'
    }
  ],
  [
    {
      text: '数字1到9，每个数字只用一次，填入下图使得横竖斜都等于15。',
      studentAnswer: ''
    },
    {
      text: '求1/1×2 + 1/2×3 + 1/3×4 + … + 1/99×100 的值',
      studentAnswer: '99/100'
    },
    {
      text: '一个三位数，百位上的数字是4，个位上的数字比十位上的数字大2，这个三位数能被9整除，这个三位数是多少？',
      studentAnswer: '405'
    },
    {
      text: '甲有钱是乙的3倍，如果甲给乙12元，两人钱数相等，甲、乙各有多少元？',
      studentAnswer: '甲36元，乙12元'
    }
  ]
]

async function recognizeProblems(imageUrl: string): Promise<OcrResult> {
  // Simulate network latency
  await new Promise(resolve => setTimeout(resolve, 500))

  // In production, call Tencent Cloud OCR:
  // const client = new OcrClient({ ... })
  // const response = await client.GeneralAccurateOCR({ ImageUrl: imageUrl })
  // then parse response into problems

  // Mock: pick a random set of problems based on the URL hash
  const urlHash = imageUrl.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const problemSet = MOCK_PROBLEMS[urlHash % MOCK_PROBLEMS.length]

  return { problems: problemSet }
}

export const ocrService = {
  recognizeProblems
}
