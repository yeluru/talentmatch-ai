import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { children: React.ReactNode };

type State = { hasError: boolean; error?: Error };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("App crashed:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle className="font-display">App failed to render</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A runtime error occurred. Reloading usually fixes it. If it keeps happening,
              we’ll trace the exact component that crashes.
            </p>
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
