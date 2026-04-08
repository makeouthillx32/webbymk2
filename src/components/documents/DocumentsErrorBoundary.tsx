// components/documents/DocumentsErrorBoundary.tsx
'use client';

import React from 'react';

interface DocumentsErrorBoundaryProps {
  children: React.ReactNode;
}

interface DocumentsErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export default class DocumentsErrorBoundary extends React.Component<
  DocumentsErrorBoundaryProps,
  DocumentsErrorBoundaryState
> {
  constructor(props: DocumentsErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): DocumentsErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Documents Error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
            <svg 
              className="h-8 w-8 text-red-600 dark:text-red-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" 
              />
            </svg>
          </div>
          
          <h2 className="mb-2 text-xl font-semibold text-red-800 dark:text-red-200">
            Something went wrong
          </h2>
          
          <p className="mb-4 text-red-600 dark:text-red-400">
            The document management system encountered an error. Please try refreshing the page.
          </p>

          {/* Error details for development */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mb-4 text-left">
              <summary className="cursor-pointer text-sm font-medium text-red-700 dark:text-red-300">
                Error Details
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600 dark:text-red-400">
                {this.state.error.message}
                {this.state.error.stack}
              </pre>
            </details>
          )}
          
          <div className="flex justify-center gap-3">
            <button
              onClick={this.handleRetry}
              className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-red-700 dark:bg-gray-800 dark:text-red-300 dark:hover:bg-gray-700"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}