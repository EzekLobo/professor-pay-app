"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export type ModalHelp = {
  intro: string;
  items: readonly { title: string; content: string }[];
};

export function Modal({
  open,
  title,
  onClose,
  children,
  className = "",
  titleNotice,
  help,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  titleNotice?: ReactNode;
  help?: ModalHelp;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`modal-dialog ${className}`.trim()}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="button button-ghost modal-close-button"
          type="button"
          aria-label="Fechar"
          title="Fechar"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {titleNotice && <div className="modal-title-notice">{titleNotice}</div>}
      {help && (
        <details className="modal-help">
          <summary>Como usar</summary>
          <p>{help.intro}</p>
          <ul>
            {help.items.map((item) => <li key={item.title}><strong>{item.title}:</strong> {item.content}</li>)}
          </ul>
        </details>
      )}
      {children}
    </dialog>
  );
}
