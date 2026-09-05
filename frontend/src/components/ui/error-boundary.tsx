import { Component, type ErrorInfo, type ReactNode } from "react";
import { SystemErrorPanel } from "./error-6";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <SystemErrorPanel
          code="500"
          eyebrow="Application Error"
          title="Something unexpected happened"
          description={
            this.state.error?.message &&
            !this.state.error.message.includes("Object")
              ? this.state.error.message
              : "We encountered an unexpected issue while rendering this section. Your stored data is unaffected."
          }
          buttonLabel="Reload application"
          onAction={this.handleReset}
          secondaryLabel="Return to Dashboard"
          secondaryHref="/dashboard"
        />
      );
    }

    return this.props.children;
  }
}

export { SystemErrorPanel, Error6 } from "./error-6";
