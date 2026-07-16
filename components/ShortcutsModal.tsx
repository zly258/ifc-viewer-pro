import React, { KeyboardEvent } from 'react';
import { X, Keyboard, MousePointerClick } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  if (!isOpen) return null;

  const keyboard: { keys: string[]; desc: string }[] = [
    { keys: ['Esc'], desc: t.shortcuts.esc },
    { keys: ['F'], desc: t.shortcuts.focus },
    { keys: ['H'], desc: t.shortcuts.hide },
    { keys: ['I'], desc: t.shortcuts.isolate },
    { keys: ['U'], desc: t.shortcuts.unisolate },
    { keys: ['?'], desc: t.shortcuts.help },
  ];

  const mouse: { keys: string[]; desc: string }[] = [
    { keys: [t.shortcuts.mouseLeft], desc: t.about.leftClickDesc },
    { keys: [t.shortcuts.mouseMiddle], desc: t.about.middleDragDesc },
    { keys: [t.shortcuts.mouseCtrlMiddle], desc: t.about.ctrlMiddleDesc },
    { keys: [t.shortcuts.mouseWheel], desc: t.about.scrollDesc },
    { keys: [t.shortcuts.mouseRight], desc: t.about.rightClickDesc },
    { keys: [t.shortcuts.mouseDouble], desc: t.about.doubleClickDesc },
  ];

  const kbdStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 26,
    padding: '3px 9px',
    borderRadius: 6,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    boxShadow: '0 1px 0 var(--border)',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  };

  const renderRow = (row: { keys: string[]; desc: string }, idx: number) => (
    <div
      key={idx}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '9px 4px',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <div style={{ minWidth: 104, display: 'flex', gap: 5, justifyContent: 'flex-end', flexShrink: 0 }}>
        {row.keys.map((k, i) => (
          <kbd key={i} style={kbdStyle}>{k}</kbd>
        ))}
      </div>
      <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
        {row.desc}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--surface-1)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', width: 520, maxWidth: '90vw',
          maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-modal)',
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--surface-2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Keyboard size={20} style={{ color: 'var(--brand)' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t.shortcuts.title}</h2>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 4,
          }} aria-label="close">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
          <section style={{ marginBottom: 22 }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 13, fontWeight: 700, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Keyboard size={14} /> {t.shortcuts.keyboard}
            </h3>
            <div>
              {keyboard.map(renderRow)}
            </div>
          </section>

          <section>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 13, fontWeight: 700, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <MousePointerClick size={14} /> {t.shortcuts.mouse}
            </h3>
            <div>
              {mouse.map(renderRow)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;
