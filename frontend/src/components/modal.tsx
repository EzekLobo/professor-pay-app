"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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
  const helpId = useId();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      setHelpOpen(false);
    }
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
        <div className="modal-heading-actions">
          {help && (
            <button
              className="button button-ghost modal-help-trigger"
              type="button"
              aria-expanded={helpOpen}
              aria-controls={helpId}
              onClick={() => setHelpOpen((current) => !current)}
            >
              Como usar
            </button>
          )}
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
      </div>
      {titleNotice && <div className="modal-title-notice">{titleNotice}</div>}
      {help && helpOpen && (
        <section id={helpId} className="modal-help-popover" aria-label="Como usar este modal">
          <p className="modal-help-kicker">Como funciona?</p>
          <h3>Como usar este modal</h3>
          <p>{help.intro}</p>
          <ul>
            {help.items.map((item) => <li key={item.title}><strong>{item.title}:</strong> {item.content}</li>)}
          </ul>
        </section>
      )}
      {children}
    </dialog>
  );
}
