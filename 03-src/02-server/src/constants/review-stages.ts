export const REVIEW_STAGE = {
  NOT_STARTED: 0,
  PROBE_THINKING: 1,
  VERIFY_DEPTH: 2,
  EXPLORE_VARIANTS: 3,
  IDENTIFY_ERROR: 4,
  ROOT_CAUSE: 5,
  GUIDE_READING: 6,
  IDENTIFY_KNOWLEDGE: 7,
  GUIDED_SOLVING: 8,
  COMPLETE: 9,
} as const;

export type ReviewStageValue = (typeof REVIEW_STAGE)[keyof typeof REVIEW_STAGE];

export const STAGE_CODE: Record<ReviewStageValue, string> = {
  0: 'NOT_STARTED',
  1: 'PROBE_THINKING',
  2: 'VERIFY_DEPTH',
  3: 'EXPLORE_VARIANTS',
  4: 'IDENTIFY_ERROR',
  5: 'ROOT_CAUSE',
  6: 'GUIDE_READING',
  7: 'IDENTIFY_KNOWLEDGE',
  8: 'GUIDED_SOLVING',
  9: 'COMPLETE',
};

export const STAGE_PATH: Record<'correct' | 'wrong' | 'unknown', readonly ReviewStageValue[]> = {
  correct: [1, 2, 3, 9],
  wrong: [1, 4, 5, 9],
  unknown: [6, 7, 8, 9],
};

export const MAX_TURNS_PER_STAGE = 5;

export function getNextStage(
  current: ReviewStageValue,
  result: 'correct' | 'wrong' | 'unknown'
): ReviewStageValue {
  const path = STAGE_PATH[result];
  const idx = path.indexOf(current);
  if (idx === -1 || idx === path.length - 1) return REVIEW_STAGE.COMPLETE;
  return path[idx + 1];
}

export function getInitialStage(result: 'correct' | 'wrong' | 'unknown'): ReviewStageValue {
  return STAGE_PATH[result][0];
}
