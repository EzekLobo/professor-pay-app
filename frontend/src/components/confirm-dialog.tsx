"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";

export function ConfirmDialog({ open, title, children, confirmLabel, danger = false, onClose, onConfirm }: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const close = () => { if (!pending) { setError(""); onClose(); } };
  const confirm = async () => {
    if (pending) return;
    setPending(true); setError("");
    try { await onConfirm(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível concluir a operação."); }
    finally { setPending(false); }
  };
  return <Modal open={open} title={title} onClose={close} className="confirmation-dialog">
    <div className="confirmation-copy">{children}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions">
      <Button type="button" className="button-ghost" disabled={pending} onClick={close} autoFocus>Cancelar</Button>
      <Button type="button" className={danger ? "button-danger" : "button-primary"} disabled={pending} aria-busy={pending} onClick={() => void confirm()}>{pending ? "Aguarde…" : confirmLabel}</Button>
    </div>
  </Modal>;
}
