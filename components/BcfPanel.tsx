import React, { useState, useEffect } from 'react';
import { bcfManager, BcfViewpoint } from '../services/BcfManager';
import { ifcManager } from '../services/ifcManager';
import { Camera, Trash2, Download, Upload, Plus, Eye, AlertCircle } from 'lucide-react';
import { IFCElementData } from '../types';
import { useLanguage } from '../locales/LanguageContext';

interface BcfPanelProps {
    selectedElement: IFCElementData | null;
}

const BcfPanel: React.FC<BcfPanelProps> = ({ selectedElement }) => {
    const { t } = useLanguage();
    const [viewpoints, setViewpoints] = useState<BcfViewpoint[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [title, setTitle] = useState('');
    const [comment, setComment] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setViewpoints(bcfManager.getViewpoints());
        bcfManager.onViewpointsChange = (vps) => setViewpoints(vps);
    }, []);

    const handleAddViewpoint = (e: React.FormEvent) => {
        e.preventDefault();
        const success = bcfManager.captureViewpoint(title, comment, selectedElement);
        if (success) {
            setTitle('');
            setComment('');
            setIsAdding(false);
            setError(null);
        } else {
            setError(t.bcf.captureFailed);
        }
    };

    const handleRestore = (vp: BcfViewpoint) => bcfManager.restoreViewpoint(vp);

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        bcfManager.deleteViewpoint(id);
    };

    const handleExport = () => {
        const jsonStr = bcfManager.exportToJson();
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BIMVision_BCF_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (!bcfManager.importFromJson(content)) {
                alert(t.bcf.importFailed);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const formatDate = (timestamp: number) => {
        const d = new Date(timestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col h-full panel-content select-none">

            {/* Header Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-1)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                        {t.bcf.bookmarks}
                    </span>
                    {viewpoints.length > 0 && (
                        <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'var(--brand)',
                            background: 'var(--brand-soft)',
                            border: '1px solid var(--brand-border)',
                            borderRadius: 99,
                            padding: '0 6px',
                            lineHeight: '18px',
                        }}>
                            {viewpoints.length}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                        onClick={handleExport}
                        disabled={viewpoints.length === 0}
                        className="icon-button"
                        title={t.bcf.exportBookmarks}
                        style={{
                            width: 28,
                            height: 28,
                            opacity: viewpoints.length === 0 ? 0.35 : 1,
                        }}
                    >
                        <Download size={14} />
                    </button>
                    <label
                        className="icon-button"
                        title={t.bcf.importBookmarks}
                        style={{ width: 28, height: 28, cursor: 'pointer' }}
                    >
                        <Upload size={14} />
                        <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </label>
                    <button
                        onClick={() => setIsAdding(true)}
                        className="primary-button"
                        title={t.bcf.captureView}
                        style={{ minHeight: 28, padding: '4px 10px', gap: 4, fontSize: 11 }}
                    >
                        <Plus size={13} />
                        <span>{t.bcf.capture}</span>
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div style={{
                    margin: '10px 12px 0',
                    padding: '8px 10px',
                    background: 'var(--danger-soft)',
                    border: '1px solid var(--danger-border)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    fontSize: 11,
                    color: 'var(--danger)',
                }}>
                    <AlertCircle size={13} style={{ flexShrink: 0 }} />
                    <span>{error}</span>
                </div>
            )}

            {/* Add Form */}
            {isAdding && (
                <form
                    onSubmit={handleAddViewpoint}
                    className="animate-fade-in-up"
                    style={{
                        margin: '10px 12px',
                        padding: '12px',
                        background: 'var(--surface-1)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                    }}
                >
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Camera size={13} style={{ color: 'var(--brand)' }} />
                        {t.bcf.recordView}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{t.bcf.bookmarkName}</label>
                        <input
                            type="text"
                            required
                            placeholder={t.bcf.namePlaceholder}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="input-control"
                            style={{ padding: '6px 10px' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{t.bcf.issueComment}</label>
                        <textarea
                            rows={2}
                            placeholder={t.bcf.commentPlaceholder}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="input-control"
                            style={{ padding: '6px 10px', resize: 'none' }}
                        />
                    </div>
                    {selectedElement && (
                        <div style={{
                            fontSize: 10,
                            color: 'var(--brand)',
                            background: 'var(--brand-soft)',
                            border: '1px solid var(--brand-border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '5px 8px',
                        }}>
                            {t.bcf.linkedElement}：#{selectedElement.expressID} ({selectedElement.type})
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
                        <button type="button" onClick={() => setIsAdding(false)} className="secondary-button" style={{ minHeight: 28, padding: '4px 12px' }}>{t.bcf.cancel}</button>
                        <button type="submit" className="primary-button" style={{ minHeight: 28, padding: '4px 12px' }}>{t.bcf.saveView}</button>
                    </div>
                </form>
            )}

            {/* Viewpoint List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {viewpoints.length === 0 ? (
                    <div className="empty-state" style={{ paddingTop: 48 }}>
                        <div style={{
                            width: 44,
                            height: 44,
                            borderRadius: 'var(--radius-lg)',
                            background: 'var(--surface-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 8,
                        }}>
                            <Camera size={20} style={{ color: 'var(--text-muted)' }} />
                        </div>
                        <span className="empty-state-title">{t.bcf.noBookmarks}</span>
                        <span className="empty-state-desc">{t.bcf.noBookmarksDesc}</span>
                    </div>
                ) : (
                    viewpoints.map(vp => (
                        <div
                            key={vp.id}
                            onClick={() => handleRestore(vp)}
                            className="group"
                            style={{
                                position: 'relative',
                                display: 'flex',
                                gap: 10,
                                padding: '10px 10px',
                                background: 'var(--surface-0)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                transition: 'border-color 0.15s, box-shadow 0.15s',
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-border)';
                                (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                            }}
                        >
                            {/* Thumbnail */}
                            {vp.screenshot ? (
                                <div style={{
                                    width: 80,
                                    height: 56,
                                    borderRadius: 'var(--radius-sm)',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-2)',
                                    flexShrink: 0,
                                    position: 'relative',
                                }}>
                                    <img
                                        src={vp.screenshot}
                                        alt={vp.title}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        top: 3,
                                        left: 3,
                                        background: 'rgba(15, 23, 42, 0.72)',
                                        color: '#f8fafc',
                                        fontSize: 9,
                                        fontWeight: 600,
                                        padding: '1px 5px',
                                        borderRadius: 3,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 3,
                                    }}>
                                        <Eye size={8} />
                                        {t.bcf.isoView}
                                    </div>
                                </div>
                            ) : (
                                <div style={{
                                    width: 80,
                                    height: 56,
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <Camera size={16} style={{ color: 'var(--text-muted)' }} />
                                </div>
                            )}

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: 1 }}>
                                <div>
                                    <div style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        marginBottom: 3,
                                    }}>
                                        {vp.title}
                                    </div>
                                    {vp.comment && (
                                        <div style={{
                                            fontSize: 11,
                                            color: 'var(--text-muted)',
                                            lineHeight: 1.5,
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                        }}>
                                            {vp.comment}
                                        </div>
                                    )}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)',  marginTop: 4 }}>
                                    {formatDate(vp.timestamp)}
                                </div>
                            </div>

                            {/* Delete */}
                            <button
                                onClick={(e) => handleDelete(e, vp.id)}
                                className="icon-button danger-button"
                                title={t.bcf.deleteBookmark}
                                style={{
                                    width: 26,
                                    height: 26,
                                    position: 'absolute',
                                    top: 7,
                                    right: 7,
                                    background: 'var(--surface-0)',
                                    border: '1px solid var(--border)',
                                    opacity: 0,
                                    transition: 'opacity 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}
                                onMouseOver={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default BcfPanel;
