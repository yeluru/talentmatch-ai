import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { children: React.ReactNode };

type State = { hasError: boolean; error?: Error; componentStack?: string };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("App crashed:", error, errorInfo);
    // Surface component stack in the UI for faster debugging.
    this.setState({ componentStack: errorInfo?.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = Boolean(import.meta?.env?.DEV);
    const message = this.state.error?.message || "Unknown error";
    const stack = this.state.error?.stack || "";
    const componentStack = this.state.componentStack || "";

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle className="font-display">App failed to render</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              A runtime error occurred. Reloading usually fixes it. If it keeps happening,
              we’ll trace the exact component that crashes.
            </p>

            {isDev ? (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-sm font-medium text-foreground">Error</div>
                <div className="mt-1 text-xs break-words">{message}</div>
                {(stack || componentStack) ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs">Show stack trace</summary>
                    {stack ? (
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px] text-foreground">
                        {stack}
                      </pre>
                    ) : null}
                    {componentStack ? (
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px] text-foreground">
                        {componentStack}
                      </pre>
                    ) : null}
                  </details>
                ) : null}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button onClick={() => window.location.reload()}>Reload</Button>
              <Button
                variant="outline"
                onClick={() => {
                  // clear possible bad cached role
                  localStorage.removeItem("currentRole");
                  window.location.reload();
                }}
              >
                Reset role & reload
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
