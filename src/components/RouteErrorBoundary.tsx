import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  children: React.ReactNode;
  title?: string;
};

type State = { hasError: boolean; error?: Error };

export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Keep this minimal: we just need visibility when a route crashes.
    console.error("Route crashed:", error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="font-display">
              {this.props.title ?? "This page failed to load"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Something crashed while rendering this page. Click Retry to try again.
            </p>
            <div className="flex gap-2">
              <Button onClick={this.handleRetry}>Retry</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Hard refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
