import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../Button/Button';
import './ErrorBoundary.css';

export type ErrorBoundaryProps = {
  children: ReactNode;
  /** Names the area in the message, e.g. "Admin console". */
  label: string;
  /** When this value changes (e.g. the route), a caught error is cleared. */
  resetKey?: string;
};

type State = { error: Error | null };

/** Catches render errors below it and shows them, so one bad screen can't blank the whole app. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} crashed:`, error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <h2 className="error-boundary__title">{this.props.label} hit an error</h2>
        <p className="error-boundary__message">{error.message || 'Something went wrong.'}</p>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
