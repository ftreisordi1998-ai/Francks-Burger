"use client";

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        display: "inline-block",
        width: 56,
        height: 32,
        borderRadius: 9999,
        flexShrink: 0,
        border: "none",
        padding: 0,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        backgroundColor: checked ? "var(--color-success)" : "rgba(44,24,16,0.2)",
        transition: "background-color 0.2s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 4,
          left: checked ? 28 : 4,
          height: 24,
          width: 24,
          borderRadius: 9999,
          backgroundColor: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          transition: "left 0.2s ease",
        }}
      />
    </button>
  );
}
