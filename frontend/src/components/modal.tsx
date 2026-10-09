"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type ModalHelp = {
  id: string;
  version?: number;
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
  const helpRef = useRef(help);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStep, setHelpStep] = useState(0);
  const [spotlight, setSpotlight] = useState<{ left: number; top: number; width: number; height: number; right: number; bottom: number } | null>(null);
  const [helpPosition, setHelpPosition] = useState<{ left: string; top: string; width: string } | null>(null);

  useEffect(() => {
    helpRef.current = help;
  }, [help]);

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
    const activeHelp = helpRef.current;
    if (!open || !activeHelp) return;
    const key = `nexusclass:modal-guide:${activeHelp.id}:v${activeHelp.version ?? 1}`;
    let shouldOpen = true;
    try { shouldOpen = !window.localStorage.getItem(key); } catch { /* abre sem persistência */ }
    if (!shouldOpen) return;
    const timer = window.setTimeout(() => {
      setHelpStep(0);
      setHelpOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [help?.id, help?.version, open]);

  useEffect(() => {
    const activeHelp = helpRef.current;
    if (!helpOpen || !activeHelp) return;
    const dialog = dialogRef.current;
    const item = activeHelp.items[helpStep];
    if (!dialog || !item?.target) {
      setSpotlight(null);
      setHelpPosition(null);
      return;
    }
    const target = dialog.querySelector<HTMLElement>(item.target);
    if (!target) {
      setSpotlight(null);
      setHelpPosition(null);
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    const frame = window.requestAnimationFrame(() => {
      const dialogRect = dialog.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setSpotlight({
        left: Math.max(4, targetRect.left - dialogRect.left - 8),
        top: Math.max(4, targetRect.top - dialogRect.top - 8),
        width: targetRect.width + 16,
        height: targetRect.height + 16,
        right: Math.max(0, dialogRect.right - targetRect.right - 8),
        bottom: Math.max(0, dialogRect.bottom - targetRect.bottom - 8),
      });
      const viewportMargin = 16;
      const preferredWidth = 360;
      const rightSpace = window.innerWidth - dialogRect.right - viewportMargin;
      const leftSpace = dialogRect.left - viewportMargin;
      const useRight = rightSpace >= 280 || rightSpace >= leftSpace;
      const availableWidth = Math.max(240, (useRight ? rightSpace : leftSpace) - 10);
      const width = Math.min(preferredWidth, availableWidth);
      const left = useRight
        ? Math.min(window.innerWidth - width - viewportMargin, dialogRect.right + 10)
        : Math.max(viewportMargin, dialogRect.left - width - 10);
      const top = Math.max(viewportMargin, Math.min(window.innerHeight - 260, targetRect.top));
      setHelpPosition({ left: `${left}px`, top: `${top}px`, width: `${width}px` });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [help?.id, helpOpen, helpStep]);

  const finishHelp = () => {
    if (help) {
      try { window.localStorage.setItem(`nexusclass:modal-guide:${help.id}:v${help.version ?? 1}`, "completed"); } catch { /* a ajuda continua disponível pelo botão */ }
    }
    setHelpOpen(false);
  };

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
          {spotlight ? <>
            <div className="modal-guide-mask" style={{ top: 0, right: 0, left: 0, height: `${spotlight.top}px` }} aria-hidden="true" />
            <div className="modal-guide-mask" style={{ top: `${spotlight.top}px`, bottom: `${spotlight.bottom}px`, left: 0, width: `${spotlight.left}px` }} aria-hidden="true" />
            <div className="modal-guide-mask" style={{ top: `${spotlight.top}px`, right: 0, bottom: `${spotlight.bottom}px`, left: `${spotlight.left + spotlight.width}px` }} aria-hidden="true" />
            <div className="modal-guide-mask" style={{ top: `${spotlight.top + spotlight.height}px`, right: 0, bottom: 0, left: 0 }} aria-hidden="true" />
            <div className="modal-guide-spotlight" style={{ left: `${spotlight.left}px`, top: `${spotlight.top}px`, width: `${spotlight.width}px`, height: `${spotlight.height}px` }} aria-hidden="true" />
          </> : <div className="modal-guide-mask" style={{ inset: 0 }} aria-hidden="true" />}
          <section className="modal-help-popover" style={helpPosition ?? undefined} role="dialog" aria-modal="true">
            <p className="modal-help-kicker">Como funciona?</p>
            <p className="modal-help-progress">{helpStep + 1} de {help.items.length}</p>
            <h3>{help.items[helpStep]?.title}</h3>
            <p>{help.items[helpStep]?.content ?? help.intro}</p>
            {helpStep === 0 && <p className="modal-help-intro">{help.intro}</p>}
            <div className="modal-help-actions">
              <button type="button" onClick={finishHelp}>Pular</button>
              <button type="button" disabled={helpStep === 0} onClick={() => setHelpStep((step) => step - 1)}>Voltar</button>
              <button type="button" onClick={() => helpStep === help.items.length - 1 ? finishHelp() : setHelpStep((step) => step + 1)}>{helpStep === help.items.length - 1 ? "Concluir" : "Próximo"}</button>
            </div>
          </section>
        </div>
      )}
      {children}
    </dialog>
  );
}
