import type {CardReviewGrade, CardReviewState} from '../types';

export const GRADE_FORGOT: CardReviewGrade = 0;
export const GRADE_VAGUE: CardReviewGrade = 1;
export const GRADE_REMEMBER: CardReviewGrade = 2;

/** Must match REMEMBER_INTERVAL_DAYS in packages/shared/utils/cardReviewSchedule.ts. */
const REMEMBER_INTERVAL_DAYS = [1, 3, 7, 15, 30, 60];
const SECONDS_PER_CARD = 20;
const QA_PATTERN = /^Q[:\uff1a]\s*([\s\S]+?)\n\s*A[:\uff1a]\s*([\s\S]+)$/i;
const SEPARATOR_PATTERN = /\n\s*(?:-{3,}|\*{3,}|_{3,}|={3,})\s*\n/;
const PARAGRAPH_PATTERN = /\n\s*\n/;

export type CardFace = {
  question: string;
  answer: string;
};

export type ReviewResult = {
  cardId: number;
  grade: CardReviewGrade;
  duration: number;
};

/** Same split rules as the desktop learn mode: Q/A markers, a divider, or the first paragraph. */
export const splitCardContent = (content?: string | null): CardFace => {
  const text = String(content ?? '').trim();
  const qa = text.match(QA_PATTERN);
  if (qa) return {question: qa[1].trim(), answer: qa[2].trim()};
  const divider = text.match(SEPARATOR_PATTERN) ?? text.match(PARAGRAPH_PATTERN);
  if (!divider || divider.index === undefined) return {question: text, answer: ''};
  const question = text.slice(0, divider.index).trim();
  const answer = text.slice(divider.index + divider[0].length).trim();
  return question && answer ? {question, answer} : {question: text, answer: ''};
};

export const nextRememberDays = (state?: Pick<CardReviewState, 'lastGrade' | 'rememberStreak'> | null) => {
  const streak = state?.lastGrade === GRADE_REMEMBER ? state.rememberStreak : 0;
  const index = Math.min(streak + 1, REMEMBER_INTERVAL_DAYS.length) - 1;
  return REMEMBER_INTERVAL_DAYS[index];
};

export const estimateReviewMinutes = (count: number) =>
  count > 0 ? Math.max(1, Math.round((count * SECONDS_PER_CARD) / 60)) : 0;

export const summarizeReviewResults = (results: ReviewResult[]) => ({
  remember: results.filter(item => item.grade === GRADE_REMEMBER).length,
  vague: results.filter(item => item.grade === GRADE_VAGUE).length,
  forgot: results.filter(item => item.grade === GRADE_FORGOT).length,
  duration: results.reduce((total, item) => total + item.duration, 0),
});

/** Formats a duration in seconds as m:ss, e.g. 95 -> 1:35. */
export const formatReviewDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Maps a key press to a grade: 1 forgot, 2 vague, 3 remembered. */
export const gradeFromKey = (key: string): CardReviewGrade | null => {
  if (key === '1') return GRADE_FORGOT;
  if (key === '2') return GRADE_VAGUE;
  if (key === '3') return GRADE_REMEMBER;
  return null;
};
