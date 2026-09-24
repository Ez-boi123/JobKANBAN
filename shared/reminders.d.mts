export const HOUR: number;
export const DAY: number;
export function chinaDate(now: number): string;
export function actionEnd(date: string): number;
export function reminderTimes(date: string, type: string): number[];
export function planReminders(
  date: string,
  type: string,
  now: number,
): { slot: string; at: number }[];
export function validEmail(value: unknown): boolean;
export function urgency(
  job: { archived?: boolean; action: string; date: string; dateType: string },
  now: number,
): { level: string; label: string; pulse: boolean };
