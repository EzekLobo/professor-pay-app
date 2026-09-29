import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`button button-primary ${className}`} {...props} />; }
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input className="input" {...props} />; }
export function StatusBadge({tone="neutral",children}:{tone?:"success"|"warning"|"danger"|"neutral";children:ReactNode}) { return <span className={`status-badge status-${tone}`}>{children}</span>; }
