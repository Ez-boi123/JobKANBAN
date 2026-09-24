// Shared by the local app, cloud scheduler and fixed-clock tests.
export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export const chinaDate = (now) =>
  new Date(Number(now) + 8 * HOUR).toISOString().slice(0, 10);
export function actionEnd(date) {
  return date.length === 10
    ? Date.parse(`${date}T00:00:00+08:00`) + DAY - 1
    : Date.parse(date);
}
export function reminderTimes(date, type) {
  if (!date || !["deadline", "appointment"].includes(type)) return [];
  if (date.length === 10) {
    const midnight = Date.parse(`${date}T00:00:00+08:00`);
    return [midnight - 6 * HOUR, midnight + 9 * HOUR];
  }
  const at = Date.parse(date);
  return (type === "deadline" ? [24 * HOUR, 2 * HOUR] : [HOUR, 15 * 60000]).map(
    (delta) => at - delta,
  );
}
export function planReminders(date, type, now) {
  if (actionEnd(date) < now) return [];
  const times = reminderTimes(date, type);
  const crossed = times.filter((at) => at <= now);
  return [
    ...(crossed.length ? [{ slot: "catchup", at: now }] : []),
    ...times.flatMap((at, index) =>
      at > now ? [{ slot: String(index), at }] : [],
    ),
  ];
}
export function urgency(job, now) {
  const empty = { level: "none", label: "", pulse: false };
  if (
    job.archived ||
    !job.action ||
    !job.date ||
    !["deadline", "appointment"].includes(job.dateType)
  )
    return empty;
  const appointment = job.dateType === "appointment";
  const remaining = actionEnd(job.date) - now;
  if (!Number.isFinite(remaining)) return empty;
  if (remaining < 0)
    return {
      level: appointment ? "stale" : "overdue",
      label: appointment ? "预约已过 · 待更新" : "已逾期",
      pulse: false,
    };
  if (job.date.length === 10) {
    const day = chinaDate(now),
      tomorrow = chinaDate(now + DAY);
    if (![day, tomorrow].includes(job.date)) return empty;
    return {
      level: "soon",
      label: `${job.date === day ? "今天" : "明天"}${appointment ? "有预约 · 具体时间待确认" : "截止"}`,
      pulse: false,
    };
  }
  const threshold = appointment ? HOUR : DAY;
  if (remaining > threshold) return empty;
  const minutes = Math.ceil(remaining / 60000);
  const text =
    minutes === 0
      ? "现在"
      : minutes >= 60
        ? `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ""}后`
        : `${minutes}分钟后`;
  const pulse = remaining <= (appointment ? 15 * 60000 : 2 * HOUR);
  return {
    level: !appointment || pulse ? "urgent" : "soon",
    label: `${text}${appointment ? "开始" : "截止"}`,
    pulse,
  };
}
export const validEmail = (value) =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(
    value,
  );
