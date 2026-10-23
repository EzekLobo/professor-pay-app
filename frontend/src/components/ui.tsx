import type { ButtonHTMLAttributes, InputHTMLAttributes, KeyboardEvent, ReactNode } from "react";
export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { const hasVariant = className.split(/\s+/).some((name) => ["button-primary", "button-ghost", "button-danger"].includes(name)); return <button className={`button ${hasVariant ? "" : "button-primary"} ${className}`} {...props} />; }
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={`input ${className}`.trim()} {...props} />; }
export function StatusBadge({
  tone = "neutral",
  children,
  onActivate,
}: {
  tone?: "success" | "warning" | "danger" | "neutral";
  children: ReactNode;
  onActivate?: () => void;
}) {
  const activate = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!onActivate || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  };
  return (
    <span
      className={`status-badge status-${tone}${onActivate ? " status-badge-action" : ""}`}
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      title={onActivate ? "Alterar status" : undefined}
      onClick={onActivate ? (event) => { event.stopPropagation(); onActivate(); } : undefined}
      onKeyDown={activate}
    >
      {children}
    </span>
  );
}
