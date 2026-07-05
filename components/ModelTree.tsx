import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ifcManager } from '../services/ifcManager';
import { IFCSpatialStructure, IFCElementData } from '../types';
import { ChevronRight, ChevronDown, RotateCw, Trash2, Eye, EyeOff } from 'lucide-react';

import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';



interface LoadedFileStructure {
    fileName: string;
    modelID: number;
    structure: IFCSpatialStructure;
}

interface FlatNode {
    id: string;
    label: string;
    type: string;
    depth: number;
    hasChildren: boolean;
    isExpanded: boolean;
    isRootFile?: boolean;
    modelID?: number;
    expressID?: number;
    isSelected?: boolean;
}

interface ModelTreeProps {
    onLoadStructure: () => void;
    selectedElement: IFCElementData | null;
}

// Type-to-color dot mapping for node type indicators
function getTypeColor(type: string): string {
    if (type.includes('Site') || type.includes('PROJECT')) return '#8b5cf6';
    if (type.includes('Building')) return '#0ea5e9';
    if (type.includes('Storey') || type.includes('STOREY')) return '#f59e0b';
    if (type.includes('Space')) return '#10b981';
    if (type.includes('Wall')) return '#6366f1';
    if (type.includes('Slab') || type.includes('Beam')) return '#ef4444';
    if (type.includes('Column')) return '#f97316';
    if (type.includes('Window') || type.includes('Door')) return '#14b8a6';
    return 'var(--text-muted)';
}

const ModelTree: React.FC<ModelTreeProps> = ({ selectedElement }) => {
    const [fileStructures, setFileStructures] = useState<LoadedFileStructure[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [parentMap, setParentMap] = useState<Map<string, string>>(new Map());
    const [visibleModels, setVisibleModels] = useState<Set<number>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [modelToRemove, setModelToRemove] = useState<number | null>(null);
    const listRef = useRef<any>(null);

    useEffect(() => {
        const load = async () => {
            const data = await ifcManager.getFullSpatialStructure();
            setFileStructures(data);

            const defaultExpanded = new Set<string>();
            const pMap = new Map<string, string>();
            const vis = new Set<number>();

            data.forEach(f => {
                const rootId = `root_${f.modelID}`;
                defaultExpanded.add(rootId);

                if (ifcManager.isModelVisible(f.modelID)) vis.add(f.modelID);

                const traverse = (node: IFCSpatialStructure, parentId: string) => {
                    const id = `${f.modelID}_${node.expressID}`;
                    pMap.set(id, parentId);
                    if (node.children) node.children.forEach(c => traverse(c, id));
                };
                traverse(f.structure, rootId);
            });

            setParentMap(pMap);
            setExpandedIds(defaultExpanded);
            setVisibleModels(vis);
            setLoading(false);
        };
        load();
    }, []);

    useEffect(() => {
        if (selectedElement) {
            const nodeId = `${selectedElement.modelID}_${selectedElement.expressID}`;
            const newExpanded = new Set(expandedIds);
            let current = parentMap.get(nodeId);
            let changed = false;
            while (current) {
                if (!newExpanded.has(current)) { newExpanded.add(current); changed = true; }
                current = parentMap.get(current);
            }
            if (changed) setExpandedIds(newExpanded);
        }
    }, [selectedElement, parentMap]);

    const toggleNode = (id: string) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    const handleRotate = (e: React.MouseEvent, modelID: number) => {
        e.stopPropagation();
        ifcManager.rotateModel(modelID, 'x', -Math.PI / 2);
    };

    const handleRemove = (e: React.MouseEvent, modelID: number) => {
        e.stopPropagation();
        setModelToRemove(modelID);
    };

    const flatList = useMemo(() => {
        const result: FlatNode[] = [];
        let selectedIndex = -1;
        const q = searchQuery.trim().toLowerCase();

        if (q) {
            fileStructures.forEach(file => {
                const rootId = `root_${file.modelID}`;
                if (file.fileName.toLowerCase().includes(q)) {
                    result.push({ id: rootId, label: file.fileName, type: 'IFC Model', depth: 0, hasChildren: false, isExpanded: false, isRootFile: true, modelID: file.modelID });
                }
                const traverseAll = (node: IFCSpatialStructure, depth: number) => {
                    const nodeId = `${file.modelID}_${node.expressID}`;
                    const displayName = node.name || node.type;
                    if (displayName.toLowerCase().includes(q) || node.type.toLowerCase().includes(q) || `#${node.expressID}`.includes(q)) {
                        const isSelected = selectedElement?.expressID === node.expressID && selectedElement?.modelID === file.modelID;
                        if (isSelected) selectedIndex = result.length;
                        result.push({ id: nodeId, label: displayName, type: node.type, depth: 1, hasChildren: false, isExpanded: false, modelID: file.modelID, expressID: node.expressID, isSelected });
                    }
                    if (node.children) node.children.forEach(child => traverseAll(child, depth + 1));
                };
                if (file.structure) traverseAll(file.structure, 1);
            });
        } else {
            fileStructures.forEach(file => {
                const rootId = `root_${file.modelID}`;
                const isFileExpanded = expandedIds.has(rootId);
                result.push({ id: rootId, label: file.fileName, type: 'IFC Model', depth: 0, hasChildren: true, isExpanded: isFileExpanded, isRootFile: true, modelID: file.modelID });

                if (isFileExpanded && file.structure) {
                    const traverse = (node: IFCSpatialStructure, depth: number) => {
                        const nodeId = `${file.modelID}_${node.expressID}`;
                        const isExpanded = expandedIds.has(nodeId);
                        const hasChildren = node.children && node.children.length > 0;
                        const displayName = node.name || node.type;
                        const isSelected = selectedElement?.expressID === node.expressID && selectedElement?.modelID === file.modelID;
                        if (isSelected) selectedIndex = result.length;
                        result.push({ id: nodeId, label: displayName, type: node.type, depth, hasChildren, isExpanded, modelID: file.modelID, expressID: node.expressID, isSelected });
                        if (isExpanded && hasChildren) node.children.forEach(child => traverse(child, depth + 1));
                    };
                    traverse(file.structure, 1);
                }
            });
        }

        return { list: result, selectedIndex };
    }, [fileStructures, expandedIds, selectedElement, searchQuery]);

    useEffect(() => {
        if (flatList.selectedIndex !== -1 && listRef.current) {
            listRef.current.scrollToItem(flatList.selectedIndex, 'center');
        }
    }, [flatList]);

    const Row = ({ index, style, data }: ListChildComponentProps<FlatNode[]>) => {
        const node = data[index];
        if (!node) return null;
        const { id, label, type, depth, hasChildren, isExpanded, isRootFile, modelID, expressID, isSelected } = node;
        const isVisible = modelID !== undefined ? visibleModels.has(modelID) : true;
        const typeColor = getTypeColor(type);

        const handleClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (isRootFile) {
                toggleNode(id);
            } else if (modelID !== undefined && expressID !== undefined) {
                ifcManager.selectByID(modelID, expressID, false);
            } else {
                toggleNode(id);
            }
        };

        const handleDoubleClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (!isRootFile && modelID !== undefined && expressID !== undefined) {
                ifcManager.selectByID(modelID, expressID, true);
            } else {
                toggleNode(id);
            }
        };

        const handleToggleVisibility = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (modelID !== undefined) {
                const isNowVisible = ifcManager.toggleModelVisibility(modelID);
                setVisibleModels(prev => {
                    const next = new Set(prev);
                    if (isNowVisible) next.add(modelID);
                    else next.delete(modelID);
                    return next;
                });
            }
        };

        return (
            <div
                style={{
                    ...style,
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: '1px solid var(--border-soft)',
                    background: isSelected
                        ? 'var(--brand-soft)'
                        : isRootFile
                            ? 'var(--surface-1)'
                            : 'transparent',
                    transition: 'background 0.1s',
                }}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onMouseEnter={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-1)';
                }}
                onMouseLeave={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = isRootFile ? 'var(--surface-1)' : 'transparent';
                }}
            >
                <div style={{ paddingLeft: depth * 14 + 8, display: 'flex', alignItems: 'center', width: '100%', overflow: 'hidden', paddingRight: 6 }}>
                    {/* Expand toggle */}
                    <span
                        style={{
                            width: 16,
                            height: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginRight: 4,
                            color: 'var(--text-muted)',
                            borderRadius: 3,
                        }}
                        onClick={e => { e.stopPropagation(); toggleNode(id); }}
                    >
                        {hasChildren
                            ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
                            : null
                        }
                    </span>

                    {/* Type dot */}
                    {isRootFile ? (
                        <div style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'var(--brand)',
                            flexShrink: 0,
                            marginRight: 7,
                        }} />
                    ) : (
                        <div style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: isSelected ? 'var(--brand)' : typeColor,
                            flexShrink: 0,
                            marginRight: 7,
                            opacity: isSelected ? 1 : 0.6,
                        }} />
                    )}

                    {/* Label */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{
                            fontSize: 12,
                            fontWeight: isRootFile ? 700 : isSelected ? 600 : 500,
                            color: isSelected ? 'var(--brand)' : isRootFile ? 'var(--text-primary)' : 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            paddingRight: 4,
                        }}>
                            {label}
                            {!isRootFile && modelID !== undefined && modelID >= 0 && expressID !== undefined && expressID > 0 && (
                                <span style={{
                                    fontSize: 10,
                                    fontFamily: 'monospace',
                                    marginLeft: 5,
                                    color: isSelected ? 'var(--brand)' : 'var(--text-muted)',
                                    fontWeight: 400,
                                }}>
                                    #{expressID}
                                </span>
                            )}
                        </span>

                        {/* Root file actions */}
                        {isRootFile && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                <button
                                    onClick={handleToggleVisibility}
                                    title={isVisible ? '隐藏模型' : '显示模型'}
                                    className="icon-button"
                                    style={{
                                        width: 24,
                                        height: 24,
                                        color: isVisible ? 'var(--text-muted)' : 'var(--brand)',
                                    }}
                                >
                                    {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                                <button
                                    onClick={(e) => handleRotate(e, modelID!)}
                                    title="旋转修正 Up 轴"
                                    className="icon-button"
                                    style={{ width: 24, height: 24 }}
                                >
                                    <RotateCw size={12} />
                                </button>
                                <button
                                    onClick={(e) => handleRemove(e, modelID!)}
                                    title="移除模型"
                                    className="icon-button danger-button"
                                    style={{ width: 24, height: 24 }}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Skeleton loading state
    if (loading) return (
        <div className="h-full flex flex-col panel-content">
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-1)' }}>
                <div className="skeleton" style={{ height: 28, borderRadius: 'var(--radius-md)' }} />
            </div>
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 0.7, 0.85, 0.6, 0.75].map((w, i) => (
                    <div key={i} className="skeleton" style={{ height: 14, width: `${w * 100}%`, borderRadius: 4 }} />
                ))}
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col panel-content">
            {/* Search */}
            <div style={{
                padding: '7px 10px',
                borderBottom: '1px solid var(--border-soft)',
                background: 'var(--surface-1)',
            }}>
                <input
                    type="text"
                    placeholder="检索构件名称、类型或 #ID"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-control"
                    style={{ padding: '5px 10px' }}
                />
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
                {flatList.list.length > 0 ? (
                    <AutoSizer>
                        {({ height, width }) => (
                            <List
                                ref={listRef}
                                height={height}
                                itemCount={flatList.list.length}
                                itemSize={30}
                                width={width}
                                itemData={flatList.list}
                            >
                                {Row as React.ComponentType<ListChildComponentProps<FlatNode[]>>}
                            </List>
                        )}
                    </AutoSizer>
                ) : (
                    <div className="empty-state" style={{ paddingTop: 40 }}>
                        <span className="empty-state-desc">无匹配构件</span>
                    </div>
                )}
            </div>

            {/* Remove model confirm dialog */}
            {modelToRemove !== null && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.4)',
                    backdropFilter: 'blur(2px)',
                    zIndex: 50,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                }}>
                    <div className="panel-surface animate-fade-in-up" style={{ width: '100%', maxWidth: 360, padding: 20 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>移除模型</h3>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
                            确定要移除此模型吗？模型的网格与空间结构数据都将被清除，且无法撤销。
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setModelToRemove(null)} className="secondary-button">取消</button>
                            <button
                                onClick={() => {
                                    ifcManager.removeModel(modelToRemove);
                                    setFileStructures(prev => prev.filter(f => f.modelID !== modelToRemove));
                                    setModelToRemove(null);
                                }}
                                className="danger-primary-button"
                            >
                                确认移除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ModelTree;
