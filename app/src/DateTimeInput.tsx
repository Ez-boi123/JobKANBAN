import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Icon } from "./Icon";
import { chinaDay } from "./time";
import { FormSelect } from "./FormSelect";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> & {
  type: "date" | "time";
  onValueChange: (value: string) => void;
};
const pad = (n: number) => String(n).padStart(2, "0");
const parts = (value: string) => {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : chinaDay();
  return {
    year: Number(valid.slice(0, 4)),
    month: Number(valid.slice(5, 7)) - 1,
  };
};

export function DateTimeInput({ type, onValueChange, ...props }: Props) {
  const value = String(props.value || "");
  const label = String(
    props["aria-label"] || (type === "date" ? "日期" : "时间"),
  );
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => parts(type === "date" ? value : ""));
  const [time, setTime] = useState({ hour: "09", minute: "00" });
  const [position, setPosition] = useState({ left: 0, top: 0, width: 300 });
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) input.current?.focus();
  }
  function show() {
    if (props.disabled || props.readOnly || input.current?.matches(":disabled"))
      return;
    setView(parts(type === "date" ? value : ""));
    setTime({
      hour: value.slice(0, 2) || "09",
      minute: value.slice(3, 5) || "00",
    });
    setOpen(true);
  }
  function choose(next: string) {
    onValueChange(next);
    close(true);
  }
  useEffect(() => {
    if (!open) {
      panel.current?.hidePopover();
      return;
    }
    const popup = panel.current!;
    function place() {
      const rect = input.current!.getBoundingClientRect();
      const width = Math.min(
        type === "date" ? rect.width : 300,
        window.innerWidth - 24,
      );
      const height =
        popup.getBoundingClientRect().height || (type === "date" ? 350 : 210);
      const below = rect.bottom + 8;
      setPosition({
        width,
        left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)),
        top:
          below + height <= innerHeight - 12
            ? below
            : Math.max(12, rect.top - height - 8),
      });
    }
    popup.showPopover();
    place();
    const resize = new ResizeObserver(place);
    resize.observe(popup);
    resize.observe(input.current!);
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (
        !popup.contains(target) &&
        !input.current?.parentElement?.contains(target)
      )
        close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close(true);
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      resize.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, type]);
  const first = new Date(Date.UTC(view.year, view.month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const monthDays = new Date(
    Date.UTC(view.year, view.month + 1, 0),
  ).getUTCDate();
  const days = Array.from(
    { length: Math.ceil((offset + monthDays) / 7) * 7 },
    (_, index) => {
      const date = new Date(
        Date.UTC(view.year, view.month, index - offset + 1),
      );
      return {
        value: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
        day: date.getUTCDate(),
        current: date.getUTCMonth() === view.month,
      };
    },
  );
  const today = chinaDay();
  function moveMonth(delta: number) {
    const next = new Date(Date.UTC(view.year, view.month + delta, 1));
    setView({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  }
  return (
    <div className="date-time-control">
      <span className="date-time-icon">
        <Icon name={type === "date" ? "calendar" : "clock"} size={17} />
      </span>
      <input
        {...props}
        ref={input}
        type={type}
        className="form-control"
        aria-expanded={open}
        aria-haspopup="dialog"
        onChange={(event) => onValueChange(event.target.value)}
        onClick={show}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "F4") {
            event.preventDefault();
            show();
          }
        }}
      />
      <div
        ref={panel}
        popover="manual"
        className="date-picker-panel"
        role="dialog"
        aria-label={`选择${label}`}
        style={position}
      >
        {type === "date" ? (
          <>
            <div className="date-picker-header">
              <button
                type="button"
                className="icon-button"
                aria-label="上个月"
                onClick={() => moveMonth(-1)}
              >
                ‹
              </button>
              <FormSelect
                compact
                aria-label="年份"
                value={String(view.year)}
                onChange={(e) =>
                  setView((v) => ({ ...v, year: Number(e.target.value) }))
                }
              >
                {Array.from(
                  { length: 201 },
                  (_, i) => Math.floor(view.year / 100) * 100 - 100 + i,
                )
                  .filter((y) => y >= 100 && y <= 9999)
                  .map((year) => (
                    <option key={year} value={year}>
                      {year}年
                    </option>
                  ))}
              </FormSelect>
              <FormSelect
                compact
                aria-label="月份"
                value={String(view.month)}
                onChange={(e) =>
                  setView((v) => ({ ...v, month: Number(e.target.value) }))
                }
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}月
                  </option>
                ))}
              </FormSelect>
              <button
                type="button"
                className="icon-button"
                aria-label="下个月"
                onClick={() => moveMonth(1)}
              >
                ›
              </button>
            </div>
            <div className="date-picker-week" aria-hidden="true">
              {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="date-picker-grid">
              {days.map((day) => (
                <button
                  type="button"
                  key={day.value}
                  aria-label={day.value}
                  aria-pressed={day.value === value}
                  aria-current={day.value === today ? "date" : undefined}
                  className={`${!day.current ? "outside-month " : ""}${day.value === value ? "selected " : ""}${day.value === today ? "today" : ""}`}
                  onClick={() => choose(day.value)}
                >
                  {day.day}
                </button>
              ))}
            </div>
            <div className="date-picker-footer">
              <button
                type="button"
                className="button ghost"
                onClick={() => choose("")}
              >
                清除
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => choose(today)}
              >
                今天
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="time-picker-title">
              <Icon name="clock" />
              选择时间 <span>北京时间</span>
            </div>
            <div className="time-picker-fields">
              <label>
                <span>小时</span>
                <FormSelect
                  compact
                  aria-label="小时"
                  value={time.hour}
                  onChange={(e) =>
                    setTime((v) => ({ ...v, hour: e.target.value }))
                  }
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i}>{pad(i)}</option>
                  ))}
                </FormSelect>
              </label>
              <b>:</b>
              <label>
                <span>分钟</span>
                <FormSelect
                  compact
                  aria-label="分钟"
                  value={time.minute}
                  onChange={(e) =>
                    setTime((v) => ({ ...v, minute: e.target.value }))
                  }
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <option key={i}>{pad(i)}</option>
                  ))}
                </FormSelect>
              </label>
            </div>
            <div className="date-picker-footer">
              <button
                type="button"
                className="button ghost"
                onClick={() => choose("")}
              >
                清除
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => choose(`${time.hour}:${time.minute}`)}
              >
                确定时间
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
