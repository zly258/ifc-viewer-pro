import React, { useState } from 'react';
import { IFCElementData } from '../types';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';

interface PropertyPanelProps {
  data: IFCElementData | null;
  selectedCount?: number;
}

const PropertyGroup: React.FC<{
    name: string;
    props: any[];
    defaultOpen?: boolean;
    forceOpen?: boolean;
}> = ({
    name,
    props,
    defaultOpen = false,
    forceOpen = false,
}) => {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const showContent = forceOpen || isOpen;

    const handleContextMenu = (e: React.MouseEvent, prop: any, idx: number) => {
        e.preventDefault();
        navigator.clipboard.writeText(String(prop.value)).catch(() => {});
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 1200);
    };

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
                                cursor: 'context-menu',
                                background: copiedIndex === idx ? 'var(--brand-soft)' : 'transparent',
                                transition: 'background 0.2s',
                            }}
                            onContextMenu={(e) => handleContextMenu(e, prop, idx)}
                            title={t.propertyPanel.copyHint}
                        >
                            <div
                                style={{
                                    width: '42%',
                                    padding: '6px 12px 6px 24px',
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
                                    fontWeight: 500,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    userSelect: 'text',
                                }}
                                title={String(prop.value)}
                            >
                                {copiedIndex === idx ? <span style={{color: 'var(--brand)', fontWeight: 600}}>{t.propertyPanel.copied}</span> : String(prop.value)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const PropertyPanel: React.FC<PropertyPanelProps> = ({ data, selectedCount = 1 }) => {
    const { t } = useLanguage();
    const [searchQuery, setSearchQuery] = useState('');

    if (!data) {
        return (
            <div className="h-full flex flex-col panel-content" onContextMenu={(e) => e.preventDefault()}>
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
                    <span className="empty-state-title">{t.propertyPanel.noSelection}</span>
                    <span className="empty-state-desc">{t.propertyPanel.noSelectionDesc}</span>
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

    // Normalize IFC property set names → translated group names
    // Merges Chinese-named groups (基本信息/基本属性/材质信息 etc.) into unified display names
    const getGroupName = (setName: string | undefined): string => {
        if (!setName) return t.propertyPanel.groupGeneral;
        const s = setName.trim();
        // IFC standard English names that should merge into basic info
        if (/^Pset_.*Common$/i.test(s)) return t.propertyPanel.basicInfo;
        // Chinese & English names → unified groups
        if (/^(基本信息|基本属性|材质信息|材质|材质属性|材料|材料信息)$/.test(s)) return t.propertyPanel.basicInfo;
        if (/^(common|material|materials|base\s*quantit)/i.test(s)) return t.propertyPanel.basicInfo;
        if (/^(尺寸标注|尺寸|几何信息|几何|几何属性)$/.test(s)) return t.propertyPanel.groupDimensions;
        if (/^(dimension|geometry|quantit)/i.test(s)) return t.propertyPanel.groupDimensions;
        if (/^(标识数据|标识|身份|身份信息)$/.test(s)) return t.propertyPanel.groupIdentity;
        if (/^(identity|identification)$/i.test(s)) return t.propertyPanel.groupIdentity;
        // Keep original for unmatched names
        return s;
    };

    const BASIC_KEY = t.propertyPanel.basicInfo;

    // Group properties, sort: Basic Info first, then alphabetical
    const groupedProps: Record<string, any[]> = {};
    const sortedProps = [...filteredProps].sort((a, b) => {
        const na = getGroupName(a.setName);
        const nb = getGroupName(b.setName);
        if (na === BASIC_KEY && nb !== BASIC_KEY) return -1;
        if (nb === BASIC_KEY && na !== BASIC_KEY) return 1;
        return na.localeCompare(nb);
    });

    sortedProps.forEach(prop => {
        const set = getGroupName(prop.setName);
        if (!groupedProps[set]) groupedProps[set] = [];
        groupedProps[set].push(prop);
    });

    return (
        <div className="h-full flex flex-col panel-content" onContextMenu={(e) => e.preventDefault()}>

            {/* Element Header */}
            <div style={{
                padding: '10px 14px 8px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-0)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--brand)',
                            flexShrink: 0,
                        }} />
                        <span style={{
                            fontSize: 13,
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }} title={data.name || data.type}>
                            {data.name || data.type}
                        </span>
                    </div>
                    {selectedCount > 1 && (
                        <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'var(--brand)',
                            background: 'var(--brand-soft)',
                            border: '1px solid var(--brand-border)',
                            borderRadius: 99,
                            padding: '1px 6px',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                        }}>
                            {t.propertyPanel.multiSelect} ({selectedCount})
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 6, paddingLeft: 16 }}>
                    <span style={{
                        fontSize: 10,
                        
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
                        placeholder={t.propertyPanel.searchPlaceholder}
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
                            defaultOpen={setName === BASIC_KEY}
                            forceOpen={!!searchQuery}
                        />
                    ))
                ) : (
                    <div className="empty-state" style={{ paddingTop: 40, paddingBottom: 40 }}>
                        <span className="empty-state-desc">{t.propertyPanel.noMatch}</span>
                    </div>
                )}
                <div style={{ height: 20 }} />
            </div>
        </div>
    );
};

export default PropertyPanel;
