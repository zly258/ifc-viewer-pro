import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Inner fallback keeps using hooks (translations) while the boundary itself
// must stay a class component to implement getDerivedStateFromError.
const ErrorFallback: React.FC<{ error: Error | null; onReload: () => void }> = ({ error, onReload }) => {
  const { t } = useLanguage();
  return (
    <div
      style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--app-bg)', padding: 24, zIndex: 9999,
      }}
    >
      <div
        className="panel-surface animate-fade-in-up"
        style={{ maxWidth: 440, width: '100%', padding: 28, textAlign: 'center' }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--danger-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <AlertTriangle size={28} style={{ color: 'var(--danger)' }} />
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          {t.app.errorTitle}
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          {t.app.errorDesc}
        </p>
        {error && (
          <pre
            style={{
              margin: '0 0 18px', padding: '10px 12px', maxHeight: 120, overflow: 'auto',
              background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: 11, color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          >
            {error.message}
          </pre>
        )}
        <button onClick={onReload} className="primary-button" style={{ minHeight: 36, padding: '8px 20px', gap: 8 }}>
          <RotateCcw size={15} />
          {t.app.reload}
        </button>
      </div>
    </div>
  );
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught application error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
