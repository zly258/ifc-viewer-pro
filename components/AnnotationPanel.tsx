import React, { useEffect, useState } from 'react';
import { MessageSquare, Trash2, Eye } from 'lucide-react';
import { ifcManager } from '../services/ifcManager';
import { AnnotationData } from '../types';
import { useLanguage } from '../locales/LanguageContext';

export const AnnotationPanel: React.FC = () => {
    const { t } = useLanguage();
    const [annotations, setAnnotations] = useState<AnnotationData[]>([]);

    useEffect(() => {
        const refresh = () => {
            setAnnotations(ifcManager.annotationManager?.getAnnotations() || []);
        };
        refresh();
        ifcManager.annotationManager?.onChange(refresh);
        return () => ifcManager.annotationManager?.onChange(() => {});
    }, []);

    if (annotations.length === 0) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 10, opacity: 0.6,
            }}>
                <MessageSquare size={32} strokeWidth={1.5} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {t.annotations.empty}
                </span>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: '4px 0', overflowY: 'auto', maxHeight: '100%',
        }}>
            {annotations.map(a => (
                <div
                    key={a.id}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-1)', border: '1px solid var(--border-soft)',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-1)'}
                >
                    {/* Dot */}
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: '#ef4444', flexShrink: 0,
                    }} />

                    {/* Text */}
                    <span style={{
                        flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500,
                        color: 'var(--text-primary)', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {a.text}
                    </span>

                    {/* Actions */}
                    <button
                        title={t.annotations.focus}
                        onClick={() => ifcManager.annotationManager?.focusAnnotation(a.id)}
                        style={{
                            width: 24, height: 24, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', border: 'none', background: 'transparent',
                            color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 4,
                        }}
                    >
                        <Eye size={12} />
                    </button>
                    <button
                        title={t.annotations.delete}
                        onClick={() => ifcManager.annotationManager?.removeAnnotation(a.id)}
                        style={{
                            width: 24, height: 24, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', border: 'none', background: 'transparent',
                            color: 'var(--danger)', cursor: 'pointer', borderRadius: 4,
                        }}
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
        </div>
    );
};

export default AnnotationPanel;
