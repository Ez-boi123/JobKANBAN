import type { Job } from "./types";
export const chinaDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const day = (value: string) => value?.slice(0, 10) || "";
export function weekBounds(now: Date) {
  const base = new Date(`${chinaDay(now)}T12:00:00+08:00`);
  const weekday = new Date(`${chinaDay(now)}T00:00:00Z`).getUTCDay();
  base.setUTCDate(base.getUTCDate() - ((weekday + 6) % 7));
  const start = chinaDay(base);
  base.setUTCDate(base.getUTCDate() + 6);
  return [start, chinaDay(base)];
}
export function past(j: Job, now: Date) {
  return (
    !!j.date &&
    (j.date.length > 10
      ? new Date(j.date).getTime() < now.getTime()
      : day(j.date) < chinaDay(now))
  );
}
export const overdue = (j: Job, now: Date) =>
  !!j.action && j.dateType === "deadline" && past(j, now);
export const stale = (j: Job, now: Date) =>
  !!j.action && j.dateType === "appointment" && past(j, now);
export function dateLabel(j: Job, now: Date) {
  if (!j.date) return j.action ? "未设置时间" : "";
  const d = day(j.date),
    tomorrow = chinaDay(new Date(now.getTime() + 86400000));
  const prefix =
    d === chinaDay(now)
      ? "今天"
      : d === tomorrow
        ? "明天"
        : `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
  const time = j.date.length > 10 ? ` ${j.date.slice(11, 16)}` : "";
  return `${overdue(j, now) ? "已逾期 · " : stale(j, now) ? "待更新 · " : ""}${prefix}${time}${overdue(j, now) || stale(j, now) ? "" : j.dateType === "deadline" ? " 截止" : " 预约"}`;
}
export function waitLabel(j: Job, now: Date) {
  return /已投递|待反馈/.test(j.status)
    ? `等待反馈 ${Math.max(0, Math.floor((Date.parse(chinaDay(now)) - Date.parse(j.statusSince.length > 10 ? chinaDay(new Date(j.statusSince)) : j.statusSince || chinaDay(now))) / 86400000))} 天`
    : "";
}
