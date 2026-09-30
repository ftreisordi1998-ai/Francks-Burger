const TONE_CLASSES = {
  warning: "bg-warning-bg text-warning",
  success: "bg-success-bg text-success",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
} as const;

export function Badge({
  tone,
  children,
}: {
  tone: keyof typeof TONE_CLASSES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
