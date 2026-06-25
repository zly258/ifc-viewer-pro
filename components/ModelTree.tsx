import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ifcManager } from '../services/ifcManager';
import { IFCSpatialStructure, IFCElementData } from '../types';
import { ChevronRight, ChevronDown, Box, Folder, FileBox, RotateCw, Trash2, Eye, EyeOff } from 'lucide-react';

// Using @ts-ignore to bypass type issues with react-window and react-virtualized-auto-sizer
// @ts-ignore
import { FixedSizeList as List } from 'react-window';
// @ts-ignore
import * as AutoSizerPkg from 'react-virtualized-auto-sizer';

const AutoSizer = (AutoSizerPkg as any).default || AutoSizerPkg;
const ListComponent = List as any;
const AutoSizerComponent = AutoSizer as any;

interface ListChildComponentProps<T> {
    index: number;
    style: React.CSSProperties;
    data: T;
}

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

const ModelTree: React.FC<ModelTreeProps> = ({ selectedElement }) => {
    const [fileStructures, setFileStructures] = useState<LoadedFileStructure[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [parentMap, setParentMap] = useState<Map<string, string>>(new Map());
    const [visibleModels, setVisibleModels] = useState<Set<number>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [modelToRemove, setModelToRemove] = useState<number | null>(null);
    const listRef = useRef<any>(null);

    // Initial Load
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
                
                // Track visibility state on load
                if (ifcManager.isModelVisible(f.modelID)) {
                    vis.add(f.modelID);
                }
                
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

    // Sync Selection from Scene
    useEffect(() => {
        if (selectedElement) {
            const nodeId = `${selectedElement.modelID}_${selectedElement.expressID}`;
            
            const newExpanded = new Set(expandedIds);
            let current = parentMap.get(nodeId);
            let changed = false;
            while(current) {
                if (!newExpanded.has(current)) {
                    newExpanded.add(current);
                    changed = true;
                }
                current = parentMap.get(current);
            }
            if (changed) {
                setExpandedIds(newExpanded);
            }
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
    }

    const flatList = useMemo(() => {
        const result: FlatNode[] = [];
        let selectedIndex = -1;
        const q = searchQuery.trim().toLowerCase();

        if (q) {
            // Search Mode
            fileStructures.forEach(file => {
                const rootId = `root_${file.modelID}`;
                
                // Show root file if name matches, or search inside
                const isRootMatch = file.fileName.toLowerCase().includes(q);
                if (isRootMatch) {
                    result.push({
                        id: rootId,
                        label: file.fileName,
                        type: 'IFC Model',
                        depth: 0,
                        hasChildren: false,
                        isExpanded: false,
                        isRootFile: true,
                        modelID: file.modelID
                    });
                }

                const traverseAll = (node: IFCSpatialStructure, depth: number) => {
                    const nodeId = `${file.modelID}_${node.expressID}`;
                    const displayName = node.name || node.type;
                    const matchLabel = displayName.toLowerCase();
                    const matchType = node.type.toLowerCase();
                    const matchID = `#${node.expressID}`;
                    
                    if (matchLabel.includes(q) || matchType.includes(q) || matchID.includes(q)) {
                        const isSelected = selectedElement?.expressID === node.expressID && selectedElement?.modelID === file.modelID;
                        if (isSelected) selectedIndex = result.length;

                        result.push({
                            id: nodeId,
                            label: displayName,
                            type: node.type,
                            depth: 1, // Single level indentation for flat search results
                            hasChildren: false,
                            isExpanded: false,
                            modelID: file.modelID,
                            expressID: node.expressID,
                            isSelected
                        });
                    }
                    if (node.children) {
                        node.children.forEach(child => traverseAll(child, depth + 1));
                    }
                };

                if (file.structure) {
                    traverseAll(file.structure, 1);
                }
            });
        } else {
            // Standard Hierarchy Mode
            fileStructures.forEach(file => {
                const rootId = `root_${file.modelID}`;
                const isFileExpanded = expandedIds.has(rootId);
                
                result.push({
                    id: rootId,
                    label: file.fileName,
                    type: 'IFC Model',
                    depth: 0,
                    hasChildren: true,
                    isExpanded: isFileExpanded,
                    isRootFile: true,
                    modelID: file.modelID
                });

                if (isFileExpanded && file.structure) {
                    const traverse = (node: IFCSpatialStructure, depth: number) => {
                        const nodeId = `${file.modelID}_${node.expressID}`;
                        const isExpanded = expandedIds.has(nodeId);
                        const hasChildren = node.children && node.children.length > 0;
                        const displayName = node.name || node.type; 
                        
                        const isSelected = selectedElement?.expressID === node.expressID && selectedElement?.modelID === file.modelID;
                        if (isSelected) selectedIndex = result.length;

                        result.push({
                            id: nodeId,
                            label: displayName,
                            type: node.type,
                            depth,
                            hasChildren,
                            isExpanded,
                            modelID: file.modelID,
                            expressID: node.expressID,
                            isSelected
                        });

                        if (isExpanded && hasChildren) {
                            node.children.forEach(child => traverse(child, depth + 1));
                        }
                    };
                    traverse(file.structure, 1);
                }
            });
        }

        return { list: result, selectedIndex };
    }, [fileStructures, expandedIds, selectedElement, searchQuery]);

    useEffect(() => {
        if (flatList.selectedIndex !== -1 && listRef.current) {
            listRef.current.scrollToItem(flatList.selectedIndex, "center");
        }
    }, [flatList]);

    const Row = ({ index, style, data }: ListChildComponentProps<FlatNode[]>) => {
        const node = data[index];
        if (!node) return null;

        const { id, label, type, depth, hasChildren, isExpanded, isRootFile, modelID, expressID, isSelected } = node;

        const isVisible = modelID !== undefined ? visibleModels.has(modelID) : true;

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
                    if (isNowVisible) {
                        next.add(modelID);
                    } else {
                        next.delete(modelID);
                    }
                    return next;
                });
            }
        };

        return (
            <div 
                style={style} 
                className={`flex items-center cursor-pointer select-none transition-colors border-b border-slate-100/30 
                    ${isRootFile ? 'bg-slate-50 border-b border-slate-200/50' : ''} 
                    ${isSelected ? 'bg-blue-50/80 text-blue-700' : 'hover:bg-slate-50/70'}
                `}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
            >
                <div style={{ paddingLeft: `${depth * 14 + 10}px` }} className="flex items-center w-full overflow-hidden pr-2">
                    <span 
                        className="mr-1 text-slate-400 w-4 h-4 flex items-center justify-center flex-shrink-0 hover:bg-slate-200 rounded cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleNode(id);
                        }}
                    >
                        {hasChildren ? (
                            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                        ) : null}
                    </span>
                    
                    {isRootFile ? (
                        <FileBox size={14} strokeWidth={1.5} className="mr-2 text-blue-600 shrink-0" />
                    ) : (
                        hasChildren ? 
                        <Folder size={14} strokeWidth={1.5} className={`mr-2 shrink-0 ${isSelected ? 'text-blue-500' : 'text-yellow-500 fill-yellow-500/10'}`} /> : 
                        <Box size={14} strokeWidth={1.5} className={`mr-2 shrink-0 ${isSelected ? 'text-blue-500' : 'text-green-600'}`} />
                    )}
                    
                    <div className="flex-1 truncate flex items-center justify-between min-w-0">
                         <span className={`text-xs truncate whitespace-nowrap pr-1.5 ${isRootFile ? 'text-slate-800 font-bold' : isSelected ? 'text-blue-700 font-bold' : 'text-slate-600 font-semibold'}`}>
                            {label}
                            {!isRootFile && modelID !== undefined && modelID >= 0 && expressID !== undefined && expressID > 0 && (
                                <span className={`text-[10px] font-mono ml-1 font-normal ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>
                                    #{expressID}
                                </span>
                            )}
                         </span>
                        
                        {isRootFile && (
                            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                                <button 
                                    onClick={handleToggleVisibility}
                                    title={isVisible ? "隐藏模型" : "显示模型"}
                                    className={`p-1 rounded transition-colors ${isVisible ? 'text-slate-400 hover:text-blue-600 hover:bg-blue-100' : 'text-slate-400 bg-slate-200 hover:text-slate-600 hover:bg-slate-300'}`}
                                >
                                    {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                                <button 
                                    onClick={(e) => handleRotate(e, modelID!)}
                                    title="旋转模型 (修正 Up 轴)"
                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                >
                                    <RotateCw size={12} />
                                </button>
                                <button 
                                    onClick={(e) => handleRemove(e, modelID!)}
                                    title="移除模型"
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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

    if (loading) return (
        <div className="h-full flex flex-col bg-white">
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">正在分析...</div>
        </div>
    );

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Search Input Box */}
            <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                <input 
                    type="text"
                    placeholder="输入检索构件名称、类型或ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-semibold placeholder-slate-400"
                />
            </div>

            <div className="flex-1 min-h-0">
                {flatList.list.length > 0 ? (
                    <AutoSizerComponent>
                        {({ height, width }: {height: number, width: number}) => (
                            <ListComponent
                                ref={listRef}
                                height={height}
                                itemCount={flatList.list.length}
                                itemSize={32}
                                width={width}
                                itemData={flatList.list}
                            >
                                {Row}
                            </ListComponent>
                        )}
                    </AutoSizerComponent>
                ) : (
                    <div className="p-6 text-xs text-slate-400 flex justify-center">无匹配构件</div>
                )}
            </div>

            {modelToRemove !== null && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-5 animate-in fade-in zoom-in-95 duration-150">
                        <h3 className="text-sm font-semibold text-slate-800 mb-2">移除模型</h3>
                        <p className="text-xs text-slate-500 mb-4 leading-relaxed">确定要移除此模型吗？其所有的网格 and 树状结构数据都将被清除。</p>
                        <div className="flex justify-end gap-2 text-xs">
                           <button 
                                onClick={() => setModelToRemove(null)} 
                                className="px-3.5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium border border-slate-200"
                            >
                                取消
                            </button>
                            <button 
                                onClick={() => {
                                    ifcManager.removeModel(modelToRemove);
                                    setFileStructures(prev => prev.filter(f => f.modelID !== modelToRemove));
                                    setModelToRemove(null);
                                }} 
                                className="px-3.5 py-2 text-white bg-red-600 hover:bg-red-700 font-semibold rounded-lg transition-colors"
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
