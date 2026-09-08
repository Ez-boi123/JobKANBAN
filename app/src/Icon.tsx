export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    plus: "M12 5v14M5 12h14",
    close: "m6 6 12 12M18 6 6 18",
    arrow: "M5 12h14m-5-5 5 5-5 5",
    check: "m5 12 4 4L19 6",
    pin: "M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z",
    edit: "m15 5 4 4M4 20l4-1L20 7a3 3 0 0 0-4-4L4 15v5Z",
    archive: "M3 3h18v5H3zM5 8v13h14V8M10 12h4",
    board: "M3 3h18v18H3zM9 3v18M15 3v18",
    calendar: "M3 5h18v16H3zM16 3v4M8 3v4M3 11h18",
    link: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
    clock: "M12 7v5l3 2",
    search: "m16 16 5 5",
    alert: "m12 3 10 18H2L12 3ZM12 9v5m0 3v.01",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "clock" && <circle cx="12" cy="12" r="9" />}
      {name === "search" && <circle cx="10.5" cy="10.5" r="6.5" />}
      <path d={paths[name] || paths.arrow} />
    </svg>
  );
}
