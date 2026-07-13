import React, { useState } from 'react';
import { useLanguage } from '../locales/LanguageContext';
import { ifcManager } from '../services/ifcManager';

interface CompareResult {
    modelAName: string;
    modelBName: string;
    uniqueToA: Array<{ expressID: number; guid: string; name: string; type: string }>;
    uniqueToB: Array<{ expressID: number; guid: string; name: string; type: string }>;
    common: Array<{ guid: string; nameA: string; nameB: string; typeA: string; typeB: string }>;
}

const ComparePanel: React.FC = () => {
    const { t } = useLanguage();
    const [comparing, setComparing] = useState(false);
    const [result, setResult] = useState<CompareResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'uniqueA' | 'uniqueB' | 'common'>('uniqueA');

    const modelCount = ifcManager.models.size;

    const handleCompare = async () => {
        if (modelCount < 2) return;
        setComparing(true);
        setError(null);
        setResult(null);

        const modelIDs = Array.from(ifcManager.models.keys());
        try {
            const res = await ifcManager.compareModels(modelIDs[0], modelIDs[1]);
            if (!res) {
                setError(t.compare.error || 'Compare failed');
            } else {
                setResult(res);
            }
        } catch (e: any) {
            setError(e.message || 'Unknown error');
        }
        setComparing(false);
    };

    const tabs = [
        { key: 'uniqueA' as const, label: t.compare.uniqueToA, count: result?.uniqueToA.length ?? 0, color: '#f97316' },
        { key: 'uniqueB' as const, label: t.compare.uniqueToB, count: result?.uniqueToB.length ?? 0, color: '#8b5cf6' },
        { key: 'common' as const, label: t.compare.common, count: result?.common.length ?? 0, color: '#22c55e' },
    ];

    const getList = () => {
        if (!result) return [];
        switch (viewMode) {
            case 'uniqueA': return result.uniqueToA;
            case 'uniqueB': return result.uniqueToB;
            case 'common': return result.common;
        }
    };

    const list = getList();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
            {/* Summary */}
            <div style={{
                padding: '8px 12px',
                background: 'var(--surface-1)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
            }}>
                {modelCount < 2 ? (
                    <span style={{ color: 'var(--text-muted)' }}>{t.compare.needTwoModels}</span>
                ) : (
                    <>
                        <span>{t.compare.selectModelsHint}</span>
                        <button
                            onClick={handleCompare}
                            disabled={comparing}
                            className="primary-button"
                            style={{ marginTop: 8, width: '100%', fontSize: 12, padding: '6px 12px' }}
                        >
                            {comparing ? t.compare.comparing : t.compare.startCompare}
                        </button>
                    </>
                )}
            </div>

            {/* Error */}
            {error && (
                <div style={{ padding: 8, fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                    {error}
                </div>
            )}

            {/* Result */}
            {result && (
                <>
                    {/* Stats */}
                    <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                        {tabs.map(tab => (
                            <div key={tab.key} style={{
                                flex: 1,
                                textAlign: 'center',
                                padding: '6px 4px',
                                background: 'var(--surface-1)',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                            }}>
                                <div style={{ fontWeight: 700, fontSize: 16, color: tab.color }}>{tab.count}</div>
                                <div style={{ color: 'var(--text-muted)' }}>{tab.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setViewMode(tab.key)}
                                style={{
                                    flex: 1,
                                    padding: '6px 8px',
                                    fontSize: 11,
                                    fontWeight: viewMode === tab.key ? 700 : 500,
                                    color: viewMode === tab.key ? tab.color : 'var(--text-muted)',
                                    background: 'none',
                                    border: 'none',
                                    borderBottom: viewMode === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {tab.label} ({tab.count})
                            </button>
                        ))}
                    </div>

                    {/* List */}
                    <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ position: 'sticky', top: 0, background: 'var(--surface-0)', zIndex: 1 }}>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                                        {viewMode === 'common' ? t.compare.guid : '#'}
                                    </th>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                                        {viewMode === 'common' ? `${result.modelAName} / ${result.modelBName}` : t.compare.name}
                                    </th>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                                        {t.compare.type}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 11 }}>
                                            {t.compare.noResults}
                                        </td>
                                    </tr>
                                ) : list.map((item: any, idx) => (
                                    <tr
                                        key={item.guid || idx}
                                        style={{
                                            borderBottom: '1px solid var(--border-light)',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-1)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <td style={{ padding: '3px 6px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 10 }}>
                                            {viewMode === 'common' ? item.guid?.substring(0, 8) + '...' : `${idx + 1}`}
                                        </td>
                                        <td style={{ padding: '3px 6px', color: 'var(--text-primary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {viewMode === 'common'
                                                ? <><span style={{ color: '#f97316' }}>{item.nameA || '-'}</span><span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span><span style={{ color: '#8b5cf6' }}>{item.nameB || '-'}</span></>
                                                : item.name || '-'}
                                        </td>
                                        <td style={{ padding: '3px 6px', color: 'var(--text-muted)', fontSize: 10, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {viewMode === 'common'
                                                ? <><span style={{ color: '#f97316' }}>{item.typeA || '-'}</span><span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>/</span><span style={{ color: '#8b5cf6' }}>{item.typeB || '-'}</span></>
                                                : item.type || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default ComparePanel;
