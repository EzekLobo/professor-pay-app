"use client";
import { Component, useLayoutEffect, type ReactNode } from "react";
import { enableOperationLogging, reportOperation } from "@/lib/operation-log-client";
import { classifyOperationError, operationErrorType } from "@/lib/operation-log";
export function OperationTelemetry({ uid }: { uid: string }) {
  useLayoutEffect(() => {
    if (uid === "demo-profile") return;
    const stop = enableOperationLogging(uid);
    const error = (event: ErrorEvent) => { reportOperation("browser_runtime", "error", { errorCode: classifyOperationError(event.error), errorType: operationErrorType(event.error) }); };
    const rejection = (event: PromiseRejectionEvent) => reportOperation("browser_runtime", "error", { errorCode: classifyOperationError(event.reason), errorType: operationErrorType(event.reason) });
    window.addEventListener("error", error); window.addEventListener("unhandledrejection", rejection);
    return () => { window.removeEventListener("error", error); window.removeEventListener("unhandledrejection", rejection); stop(); };
  }, [uid]);
  return null;
}

export class OperationalErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { reportOperation("browser_runtime", "error", { errorCode: classifyOperationError(error), errorType: operationErrorType(error) }); }
  render() {
    if (this.state.failed) return <section className="panel" role="alert"><h2>Não foi possível exibir esta tela</h2><p>Tente novamente ou use o menu para acessar outra área.</p><button className="button button-primary" type="button" onClick={() => this.setState({ failed: false })}>Tentar novamente</button></section>;
    return this.props.children;
  }
}
