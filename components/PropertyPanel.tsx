import React, { useState } from 'react';
import { IFCElementData } from '../types';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';

interface PropertyPanelProps {
  data: IFCElementData | null;
}

const PropertyGroup = ({
    name,
    props,
    defaultOpen = false,
    forceOpen = false,
}: {
    name: string;
    props: any[];
    defaultOpen?: boolean;
    forceOpen?: boolean;
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const showContent = forceOpen || isOpen;

    return (
        <div style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    padding: '7px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: showContent ? 'var(--brand-soft)' : 'var(--surface-1)',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s ease',
                }}
            >
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'flex' }}>
                    {showContent
                        ? <ChevronDown size={13} />
                        : <ChevronRight size={13} />
                    }
                </span>
                <span style={{
                    flex: 1,
                    fontSize: 11,
                    fontWeight: 600,
                    color: showContent ? 'var(--brand)' : 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {name}
                </span>
                <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: showContent ? 'var(--brand)' : 'var(--text-muted)',
                    background: showContent ? 'var(--brand-soft)' : 'var(--surface-2)',
                    border: `1px solid ${showContent ? 'var(--brand-border)' : 'var(--border)'}`,
                    borderRadius: 99,
                    padding: '0 5px',
                    lineHeight: '16px',
                    flexShrink: 0,
                }}>
                    {props.length}
                </span>
            </button>

            {showContent && (
                <div>
                    {props.map((prop, idx) => (
                        <div
                            key={idx}
                            style={{
                                display: 'flex',
                                fontSize: 11,
                                borderBottom: '1px solid var(--border-soft)',
                            }}
                        >
                            <div
                                style={{
                                    width: '42%',
                                    padding: '6px 12px',
                                    color: 'var(--text-muted)',
                                    fontWeight: 500,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    borderRight: '1px solid var(--border-soft)',
                                    flexShrink: 0,
                                }}
                                title={prop.name}
                            >
                                {prop.name}
                            </div>
                            <div
                                style={{
                                    flex: 1,
                                    padding: '6px 12px',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'monospace',
                                    fontWeight: 500,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    userSelect: 'text',
                                }}
                                title={String(prop.value)}
                            >
                                {String(prop.value)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const PropertyPanel: React.FC<PropertyPanelProps> = ({ data }) => {
    const [searchQuery, setSearchQuery] = useState('');

    if (!data) {
        return (
            <div className="h-full flex flex-col panel-content">
                <div className="empty-state h-full">
                    <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--surface-2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 8,
                    }}>
                        <Search size={18} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <span className="empty-state-title">未选择构件</span>
                    <span className="empty-state-desc">在 3D 视图中单击模型构件，查看详细属性信息</span>
                </div>
            </div>
        );
    }

    const q = searchQuery.toLowerCase().trim();
    const filteredProps = data.properties.filter(prop => {
        if (!q) return true;
        return (
            (prop.name || '').toLowerCase().includes(q) ||
            String(prop.value || '').toLowerCase().includes(q) ||
            (prop.setName || '').toLowerCase().includes(q)
        );
    });

    // Group properties, sort: Info first, then alphabetical
    const groupedProps: Record<string, any[]> = {};
    const sortedProps = [...filteredProps].sort((a, b) => {
        if (a.setName === 'Info') return -1;
        if (b.setName === 'Info') return 1;
        return (a.setName || '').localeCompare(b.setName || '');
    });

    sortedProps.forEach(prop => {
        const set = prop.setName || 'General';
        if (!groupedProps[set]) groupedProps[set] = [];
        groupedProps[set].push(prop);
    });

    return (
        <div className="h-full flex flex-col panel-content">

            {/* Element Header */}
            <div style={{
                padding: '10px 14px 8px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-0)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--brand)',
                        flexShrink: 0,
                    }} />
                    <span style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }} title={data.name || data.type}>
                        {data.name || data.type}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 6, paddingLeft: 16 }}>
                    <span style={{
                        fontSize: 10,
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '1px 6px',
                    }}>
                        #{data.expressID}
                    </span>
                    <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'var(--brand)',
                        background: 'var(--brand-soft)',
                        border: '1px solid var(--brand-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '1px 6px',
                    }}>
                        {data.type}
                    </span>
                </div>
            </div>

            {/* Search */}
            <div style={{
                padding: '7px 10px',
                borderBottom: '1px solid var(--border-soft)',
                background: 'var(--surface-1)',
            }}>
                <div style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="检索属性名或属性值..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-control"
                        style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6 }}
                    />
                    <Search
                        size={13}
                        style={{
                            position: 'absolute',
                            left: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                            pointerEvents: 'none',
                        }}
                    />
                </div>
            </div>

            {/* Property Groups */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {Object.keys(groupedProps).length > 0 ? (
                    Object.entries(groupedProps).map(([setName, props]) => (
                        <PropertyGroup
                            key={setName}
                            name={setName}
                            props={props}
                            defaultOpen={setName === 'Info' || setName.includes('Common')}
                            forceOpen={!!searchQuery}
                        />
                    ))
                ) : (
                    <div className="empty-state" style={{ paddingTop: 40, paddingBottom: 40 }}>
                        <span className="empty-state-desc">无匹配属性</span>
                    </div>
                )}
                <div style={{ height: 20 }} />
            </div>
        </div>
    );
};

export default PropertyPanel;
