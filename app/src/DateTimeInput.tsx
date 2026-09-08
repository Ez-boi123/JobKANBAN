import type { InputHTMLAttributes } from "react";
import { Icon } from "./Icon";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type: "date" | "time";
};

export function DateTimeInput({ type, ...props }: Props) {
  return (
    <div className="date-time-control">
      <span className="date-time-icon">
        <Icon name={type === "date" ? "calendar" : "clock"} size={17} />
      </span>
      <input
        {...props}
        type={type}
        className="form-control"
        onClick={(event) => {
          if (event.currentTarget.disabled || event.currentTarget.readOnly)
            return;
          // Open from the entire field, while keeping native input and keyboard editing.
          try {
            event.currentTarget.showPicker?.();
          } catch {
            /* Native indicator remains available in older browsers. */
          }
        }}
      />
    </div>
  );
}
