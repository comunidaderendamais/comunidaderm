import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: '', errorStack: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    try {
      const errorStack = String(error?.stack || '').trim();
      const componentStack = String(errorInfo?.componentStack || '').trim();
      this.setState({ errorStack, componentStack });
    } catch {}
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#1A1A1A] text-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-black/30 border border-red-500/50 rounded-2xl p-6">
          <h2 className="text-xl font-black mb-2">Ocorreu um erro na tela</h2>
          <p className="text-sm text-gray-300 break-words">{String(this.state.error?.message || this.state.error || 'Erro desconhecido')}</p>
          {(this.state.errorStack || this.state.componentStack) ? (
            <details className="mt-4 rounded-xl border border-gray-700 bg-black/20 p-4">
              <summary className="cursor-pointer text-sm font-black text-gray-200">Detalhes técnicos</summary>
              <div className="mt-3 space-y-3">
                {this.state.componentStack ? (
                  <pre className="whitespace-pre-wrap break-words text-xs text-gray-300">{this.state.componentStack}</pre>
                ) : null}
                {this.state.errorStack ? (
                  <pre className="whitespace-pre-wrap break-words text-xs text-gray-300">{this.state.errorStack}</pre>
                ) : null}
              </div>
            </details>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-xl bg-[#00FF00] text-black font-black"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}

