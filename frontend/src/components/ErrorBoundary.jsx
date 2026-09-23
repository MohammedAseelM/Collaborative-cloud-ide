// src/components/ErrorBoundary.jsx
// Responsibility: Intercept component-level errors and display a clean fallback interface.

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
          <div className="rounded-full bg-red-950/40 p-4 border border-red-500/20 mb-4 animate-pulse">
            <AlertTriangle size={36} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Something went wrong</h1>
          <p className="text-sm text-slate-400 mt-2 max-w-md">
            An unexpected error occurred in this section of the app. Please reload the page or click below to retry.
          </p>
          {this.state.error && (
            <pre className="mt-4 p-3 rounded bg-slate-900 border border-slate-800 text-xs text-red-400 font-mono text-left max-w-lg overflow-x-auto max-h-40">
              {this.state.error.toString()}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="mt-6 flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            <RefreshCw size={14} />
            Reload Workspace
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
