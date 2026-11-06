/** Accumulate mouse-wheel input in one animation; leave horizontal gestures native. */
export function attachActivityWheelScroll(root: HTMLElement) {
  let grid: HTMLElement | null = null;
  let frame: number | null = null;
  let target = 0;
  let lastTime = 0;
  const cancel = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    grid = null;
  };
  const animate = (time: number) => {
    if (!grid?.isConnected) { cancel(); return; }
    target = Math.max(0, Math.min(grid.scrollWidth - grid.clientWidth, target));
    const distance = target - grid.scrollLeft;
    const step = 1 - Math.exp(-Math.min(50, Math.max(1, time - lastTime)) / 45);
    lastTime = time;
    grid.scrollTo({ left: Math.abs(distance) < 1 ? target : grid.scrollLeft + distance * step, behavior: "instant" });
    if (Math.abs(target - grid.scrollLeft) <= 1) {
      grid.scrollTo({ left: target, behavior: "instant" });
      frame = null;
    } else frame = requestAnimationFrame(animate);
  };
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || !(event.target instanceof Element)) return;
    const element = event.target.closest<HTMLElement>(".compact-activities-grid-scroll");
    if (!element || !root.contains(element)) return;
    if (event.shiftKey || event.deltaX !== 0) { cancel(); return; }
    const scale = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? element.clientWidth : 1;
    const delta = event.deltaY * scale;
    if (!Number.isFinite(delta) || !delta || element.scrollWidth <= element.clientWidth + 1) return;
    if (grid !== element || frame === null) {
      cancel();
      grid = element;
      target = element.scrollLeft;
    }
    const next = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, target + delta));
    if (next === target) {
      if (frame !== null && Math.abs(target - element.scrollLeft) > 1) event.preventDefault();
      return;
    }
    event.preventDefault();
    target = next;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.scrollTo({ left: target, behavior: "instant" });
      cancel();
    } else if (frame === null) {
      lastTime = performance.now();
      frame = requestAnimationFrame(animate);
    }
  };
  const onDirectInput = () => cancel();
  root.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener("pointerdown", onDirectInput, { passive: true });
  root.addEventListener("touchstart", onDirectInput, { passive: true });
  root.addEventListener("keydown", onDirectInput);
  return {
    shift(element: HTMLElement, offset: number) { if (grid === element && frame !== null) target += offset; },
    dispose() {
      cancel();
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("pointerdown", onDirectInput);
      root.removeEventListener("touchstart", onDirectInput);
      root.removeEventListener("keydown", onDirectInput);
    },
  };
}
