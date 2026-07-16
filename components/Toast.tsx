import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { eventBus } from '../services/eventBus';
import { useLanguage } from '../locales/LanguageContext';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

const TYPE_STYLES: Record<ToastType, { color: string; icon: any }> = {
  info: { color: 'var(--brand)', icon: Info },
  success: { color: '#16a34a', icon: CheckCircle2 },
  warning: { color: '#d97706', icon: AlertTriangle },
  error: { color: '#dc2626', icon: XCircle },
};

const Toast: React.FC = () => {
  const { t } = useLanguage();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(item => item.id !== id));
  }, []);

  useEffect(() => {
    const handler = (payload: { message: string; type?: ToastType; duration?: number }) => {
      const id = ++idRef.current;
      const item: ToastItem = {
        id,
        message: payload.message,
        type: payload.type || 'info',
        duration: payload.duration ?? 3500,
      };
      setToasts(prev => [...prev, item]);
      if (item.duration > 0) {
        window.setTimeout(() => remove(id), item.duration);
      }
    };
    return eventBus.on('toast', handler);
  }, [remove]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
        maxWidth: 'min(360px, calc(100vw - 40px))',
      }}
    >
      {toasts.map(item => {
        const s = TYPE_STYLES[item.type];
        const Icon = s.icon;
        return (
          <div
            key={item.id}
            className="animate-fade-in-up"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              background: 'var(--surface-0)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${s.color}`,
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-panel)',
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}
          >
            <Icon size={16} style={{ color: s.color, flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1 }}>{item.message}</span>
            <button
              onClick={() => remove(item.id)}
              title={t.app.cancel}
              aria-label={t.app.cancel}
              className="icon-button"
              style={{
                width: 22,
                height: 22,
                flexShrink: 0,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
              }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default Toast;
