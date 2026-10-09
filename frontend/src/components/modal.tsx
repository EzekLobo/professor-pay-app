"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type ModalHelp = {
  intro: string;
  items: readonly { title: string; content: string; target?: string }[];
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
  const [helpStep, setHelpStep] = useState(0);
  const [spotlight, setSpotlight] = useState<CSSProperties | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      setHelpOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!helpOpen || !help) return;
    const dialog = dialogRef.current;
    const item = help.items[helpStep];
    if (!dialog || !item?.target) {
      setSpotlight(null);
      return;
    }
    const target = dialog.querySelector<HTMLElement>(item.target);
    if (!target) {
      setSpotlight(null);
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    const frame = window.requestAnimationFrame(() => {
      const dialogRect = dialog.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setSpotlight({
        left: `${targetRect.left - dialogRect.left - 8}px`,
        top: `${targetRect.top - dialogRect.top - 8}px`,
        width: `${targetRect.width + 16}px`,
        height: `${targetRect.height + 16}px`,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [help, helpOpen, helpStep]);

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
              onClick={() => {
                setHelpStep(0);
                setHelpOpen((current) => !current);
              }}
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
        <div className="modal-guide-layer" id={helpId} aria-label="Como usar este modal">
          {spotlight && <div className="modal-guide-spotlight" style={spotlight} aria-hidden="true" />}
          <section className="modal-help-popover" role="dialog" aria-modal="true">
            <p className="modal-help-kicker">Como funciona?</p>
            <p className="modal-help-progress">{helpStep + 1} de {help.items.length}</p>
            <h3>{help.items[helpStep]?.title}</h3>
            <p>{help.items[helpStep]?.content ?? help.intro}</p>
            {helpStep === 0 && <p className="modal-help-intro">{help.intro}</p>}
            <div className="modal-help-actions">
              <button type="button" onClick={() => setHelpOpen(false)}>Pular</button>
              <button type="button" disabled={helpStep === 0} onClick={() => setHelpStep((step) => step - 1)}>Voltar</button>
              <button type="button" onClick={() => helpStep === help.items.length - 1 ? setHelpOpen(false) : setHelpStep((step) => step + 1)}>{helpStep === help.items.length - 1 ? "Concluir" : "Próximo"}</button>
            </div>
          </section>
        </div>
      )}
      {children}
    </dialog>
  );
}
