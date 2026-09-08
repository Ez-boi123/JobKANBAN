import { useId, type SelectHTMLAttributes } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  hint: string;
}

/** Keep native keyboard, touch and screen-reader behavior for short option lists. */
export function FormSelect({ hint, children, ...props }: Props) {
  const hintId = useId();
  return (
    <div className="form-select">
      <div className="form-select-control">
        <select {...props} className="form-control" aria-describedby={hintId}>
          {children}
        </select>
        <svg
          className="form-select-chevron"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="m6 8 4 4 4-4" />
        </svg>
      </div>
      <span id={hintId} className="form-select-hint">
        {hint}
      </span>
    </div>
  );
}
