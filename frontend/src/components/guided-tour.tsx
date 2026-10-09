"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { completeTutorial, getTutorialProgress, isTutorialVersionCompleted } from "@/lib/tutorial-progress";
import { getRenderableTutorialSteps, getTutorialForPathname, tutorialSessionKey, type TutorialDefinition, type TutorialStep } from "@/lib/tutorials";

const sessionCompletedTutorials = new Set<string>();
const TARGET_WAIT_MS = 500;
const TARGET_CHECK_INTERVAL_MS = 50;
type SpotlightBounds = { left: number; top: number; width: number; height: number };

export type GuidedTourController = {
  activeStep: TutorialStep | null;
  activeTargetSelector: string | null;
  canGoBack: boolean;
  canGoNext: boolean;
  close: () => void;
  goBack: () => void;
  goNext: () => void;
  isOpen: boolean;
  open: (trigger?: HTMLElement | null) => void;
  stepIndex: number;
  stepCount: number;
  tutorial: TutorialDefinition | null;
};

function findRenderableSteps(tutorial: TutorialDefinition): TutorialStep[] {
  return getRenderableTutorialSteps(tutorial, (selector) => document.querySelector(selector) !== null);
}

export function useGuidedTour({ userId, pathname }: { userId: string; pathname: string }): GuidedTourController {
  const tutorial = getTutorialForPathname(pathname);
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [openedPathname, setOpenedPathname] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const mountedRef = useRef(true);
  const isCurrentTourOpen = isOpen && openedPathname === pathname;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const prepareSteps = useCallback(async (definition: TutorialDefinition): Promise<TutorialStep[]> => {
    const deadline = Date.now() + TARGET_WAIT_MS;
    let renderable = findRenderableSteps(definition);
    while (Date.now() < deadline && renderable.length < definition.steps.length) {
      await new Promise((resolve) => window.setTimeout(resolve, TARGET_CHECK_INTERVAL_MS));
      renderable = findRenderableSteps(definition);
    }
    return renderable;
  }, []);

  const markCompleted = useCallback((definition: TutorialDefinition) => {
    const key = tutorialSessionKey(userId, definition);
    sessionCompletedTutorials.add(key);
    void completeTutorial(userId, definition.id, definition.version).catch(() => undefined);
  }, [userId]);

  const close = useCallback(() => {
    if (!tutorial || !isCurrentTourOpen) return;
    setIsOpen(false);
    markCompleted(tutorial);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }, [isCurrentTourOpen, markCompleted, tutorial]);

  const open = useCallback((trigger?: HTMLElement | null) => {
    if (!tutorial) return;
    openerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    void prepareSteps(tutorial).then((renderable) => {
      if (!mountedRef.current || renderable.length === 0) return;
      setSteps(renderable);
      setStepIndex(0);
      setOpenedPathname(pathname);
      setIsOpen(true);
    });
  }, [pathname, prepareSteps, tutorial]);

  useEffect(() => {
    if (!tutorial) return;
    const definition = tutorial;
    let cancelled = false;
    const key = tutorialSessionKey(userId, definition);
    async function openOnFirstVisit() {
      if (sessionCompletedTutorials.has(key)) return;
      try {
        const progress = await getTutorialProgress(userId, definition.id);
        if (cancelled || isTutorialVersionCompleted(progress, definition.version)) return;
      } catch {
        if (cancelled) return;
      }
      if (!cancelled) open(null);
    }
    void openOnFirstVisit();
    return () => { cancelled = true; };
  }, [open, tutorial, userId]);

  const goBack = useCallback(() => setStepIndex((current) => Math.max(0, current - 1)), []);
  const goNext = useCallback(() => {
    if (!tutorial) return;
    if (stepIndex >= steps.length - 1) {
      close();
      return;
    }
    setStepIndex((current) => current + 1);
  }, [close, stepIndex, steps.length, tutorial]);

  return {
    activeStep: isCurrentTourOpen ? (steps[stepIndex] ?? null) : null,
    activeTargetSelector: isCurrentTourOpen ? (steps[stepIndex]?.target ?? null) : null,
    canGoBack: stepIndex > 0,
    canGoNext: stepIndex < steps.length - 1,
    close,
    goBack,
    goNext,
    isOpen: isCurrentTourOpen,
    open,
    stepIndex,
    stepCount: steps.length,
    tutorial,
  };
}

export function GuidedTourDialog({ tour }: { tour: GuidedTourController }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [spotlight, setSpotlight] = useState<SpotlightBounds | null>(null);
  const [dialogPosition, setDialogPosition] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!tour.isOpen) return;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    firstFocusable?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        tour.close();
        return;
      }
      if (event.key === "ArrowLeft" && tour.canGoBack) {
        event.preventDefault();
        tour.goBack();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        tour.goNext();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [tour]);

  useEffect(() => {
    if (!tour.isOpen || !tour.activeTargetSelector) return;

    let frame = 0;
    const updatePosition = (scrollTarget = false) => {
      const target = document.querySelector<HTMLElement>(tour.activeTargetSelector!);
      const dialog = dialogRef.current;
      if (!target || !dialog) return;

      if (scrollTarget) target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const targetRect = target.getBoundingClientRect();
        const margin = 8;
        const spotlightRect = {
          left: Math.max(4, targetRect.left - margin),
          top: Math.max(4, targetRect.top - margin),
          width: Math.min(window.innerWidth - Math.max(4, targetRect.left - margin) - 4, targetRect.width + margin * 2),
          height: Math.min(window.innerHeight - Math.max(4, targetRect.top - margin) - 4, targetRect.height + margin * 2),
        };
        setSpotlight(spotlightRect);

        if (window.innerWidth <= 768) {
          setDialogPosition(null);
          return;
        }

        const card = dialog.getBoundingClientRect();
        const gap = 28;
        const viewportMargin = 18;
        const preferred = tour.activeStep?.placement ?? "bottom";
        const candidates: Record<"top" | "right" | "bottom" | "left", { left: number; top: number }> = {
          top: { left: targetRect.left + (targetRect.width - card.width) / 2, top: targetRect.top - card.height - gap },
          right: { left: targetRect.right + gap, top: targetRect.top + (targetRect.height - card.height) / 2 },
          bottom: { left: targetRect.left + (targetRect.width - card.width) / 2, top: targetRect.bottom + gap },
          left: { left: targetRect.left - card.width - gap, top: targetRect.top + (targetRect.height - card.height) / 2 },
        };
        const order = preferred === "center"
          ? ["bottom", "right", "left", "top"] as const
          : [preferred, ...(["bottom", "right", "left", "top"] as const).filter((placement) => placement !== preferred)];
        const fits = (position: { left: number; top: number }) =>
          position.left >= viewportMargin
          && position.top >= viewportMargin
          && position.left + card.width <= window.innerWidth - viewportMargin
          && position.top + card.height <= window.innerHeight - viewportMargin;
        const position = order.map((placement) => candidates[placement]).find(fits) ?? candidates[order[0]];
        const maxLeft = Math.max(viewportMargin, window.innerWidth - card.width - viewportMargin);
        const maxTop = Math.max(viewportMargin, window.innerHeight - card.height - viewportMargin);
        setDialogPosition({
          left: `${Math.max(viewportMargin, Math.min(maxLeft, position.left))}px`,
          top: `${Math.max(viewportMargin, Math.min(maxTop, position.top))}px`,
          transform: "none",
        });
      });
    };

    updatePosition(true);
    const updateOnViewportChange = () => updatePosition();
    window.addEventListener("resize", updateOnViewportChange);
    window.addEventListener("scroll", updateOnViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateOnViewportChange);
      window.removeEventListener("scroll", updateOnViewportChange, true);
    };
  }, [tour.activeStep?.placement, tour.activeStep?.id, tour.activeTargetSelector, tour.isOpen]);

  useEffect(() => {
    const reveal = tour.activeStep?.reveal;
    if (!tour.isOpen || !reveal) return;
    if (reveal === "details") {
      const target = tour.activeTargetSelector ? document.querySelector<HTMLElement>(tour.activeTargetSelector) : null;
      const details = target?.matches("details") ? target : target?.querySelector<HTMLDetailsElement>("details");
      if (details) details.open = true;
      return;
    }
    window.dispatchEvent(new CustomEvent("nexusclass:tutorial-reveal", { detail: reveal }));
  }, [tour.activeStep?.id, tour.activeStep?.reveal, tour.activeTargetSelector, tour.isOpen]);

  if (!tour.isOpen || !tour.activeStep) return null;
  const isLastStep = !tour.canGoNext;
  const spotlightStyle: CSSProperties | undefined = spotlight
    ? {
      left: `${spotlight.left}px`,
      top: `${spotlight.top}px`,
      width: `${spotlight.width}px`,
      height: `${spotlight.height}px`,
    }
    : undefined;

  return (
    <div className="guided-tour-layer" aria-hidden={false}>
      {tour.activeTargetSelector && spotlight ? (
        <>
          <div className="guided-tour-mask" style={{ top: 0, right: 0, left: 0, height: `${spotlight.top}px` }} aria-hidden="true" />
          <div className="guided-tour-mask" style={{ top: `${spotlight.top}px`, bottom: `${window.innerHeight - spotlight.top - spotlight.height}px`, left: 0, width: `${spotlight.left}px` }} aria-hidden="true" />
          <div className="guided-tour-mask" style={{ top: `${spotlight.top}px`, right: 0, bottom: `${window.innerHeight - spotlight.top - spotlight.height}px`, left: `${spotlight.left + spotlight.width}px` }} aria-hidden="true" />
          <div className="guided-tour-mask" style={{ top: `${spotlight.top + spotlight.height}px`, right: 0, bottom: 0, left: 0 }} aria-hidden="true" />
          <div className="guided-tour-spotlight" style={spotlightStyle} aria-hidden="true" />
        </>
      ) : <div className="guided-tour-backdrop" aria-hidden="true" />}
      <div ref={dialogRef} className="guided-tour-dialog" style={tour.activeTargetSelector ? dialogPosition ?? undefined : undefined} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <button type="button" className="guided-tour-close" aria-label="Fechar guia" onClick={tour.close}>×</button>
        <p className="guided-tour-kicker">Como funciona?</p>
        <p className="guided-tour-progress">{tour.stepIndex + 1} de {tour.stepCount}</p>
        <h2 id={titleId}>{tour.activeStep.title}</h2>
        <p id={descriptionId}>{tour.activeStep.description}</p>
        {tour.activeStep.items && (
          <ul className="guided-tour-list">
            {tour.activeStep.items.map((item) => (
              <li key={item.title}><strong>{item.title}:</strong> {item.content}</li>
            ))}
          </ul>
        )}
        <div className="guided-tour-actions">
          <button type="button" onClick={tour.close}>Pular</button>
          <button type="button" onClick={tour.goBack} disabled={!tour.canGoBack}>Voltar</button>
          <button type="button" onClick={tour.goNext}>{isLastStep ? "Concluir" : "Próximo"}</button>
        </div>
      </div>
    </div>
  );
}
