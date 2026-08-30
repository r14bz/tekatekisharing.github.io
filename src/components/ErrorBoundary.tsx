import React, { Component, ErrorInfo, ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = {
  hasError: boolean;
  message: string;
};

/**
 * Prevents a single component crash from turning the whole app into a blank white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Terjadi kesalahan tak terduga.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  private handleReload = () => {
    try {
      window.location.reload();
    } catch {
      this.setState({ hasError: false, message: '' });
    }
  };

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const title = this.props.fallbackTitle || 'Halaman gagal dimuat';

    return (
      <div
        className="min-h-[100dvh] flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
        role="alert"
      >
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-lg font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Aplikasi menemui error di salah satu bagian. Anda bisa mencoba muat ulang atau kembali
              ke beranda tanpa kehilangan seluruh sesi bila memungkinkan.
            </p>
          </div>
          {this.state.message ? (
            <pre className="text-xs overflow-auto max-h-28 rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-rose-600 dark:text-rose-300">
              {this.state.message}
            </pre>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
            >
              Muat ulang
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
            >
              Coba lagi
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
