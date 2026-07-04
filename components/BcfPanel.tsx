import React, { useState, useEffect } from 'react';
import { bcfManager, BcfViewpoint } from '../services/BcfManager';
import { ifcManager } from '../services/ifcManager';
import { Camera, Trash2, Download, Upload, Plus, Eye, BookOpen, Clock, AlertCircle } from 'lucide-react';
import { IFCElementData } from '../types';

interface BcfPanelProps {
    selectedElement: IFCElementData | null;
}

const BcfPanel: React.FC<BcfPanelProps> = ({ selectedElement }) => {
    const [viewpoints, setViewpoints] = useState<BcfViewpoint[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [title, setTitle] = useState('');
    const [comment, setComment] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setViewpoints(bcfManager.getViewpoints());
        bcfManager.onViewpointsChange = (vps) => {
            setViewpoints(vps);
        };
    }, []);

    const handleAddViewpoint = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Take selected element metadata from the app state
        const success = bcfManager.captureViewpoint(title, comment, selectedElement);
        if (success) {
            setTitle('');
            setComment('');
            setIsAdding(false);
            setError(null);
        } else {
            setError("视点拍摄失败，请确保模型已加载！");
        }
    };

    const handleRestore = (vp: BcfViewpoint) => {
        bcfManager.restoreViewpoint(vp);
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // Prevent restoring when clicking delete
        bcfManager.deleteViewpoint(id);
    };

    const handleExport = () => {
        const jsonStr = bcfManager.exportToJson();
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BIMVision_BCF_Bookmarks_${Date.now()}.json`;
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
            const success = bcfManager.importFromJson(content);
            if (!success) {
                alert("BCF 导入失败，请检查文件格式是否正确。");
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    };

    return (
        <div className="flex flex-col h-full panel-content text-slate-700 font-sans select-none">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between p-3 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 tracking-wide">
                    <BookOpen size={14} className="text-blue-500" />
                    <span>视点书签 ({viewpoints.length})</span>
                </div>
                <div className="flex items-center gap-1">
                    <button 
                        onClick={handleExport}
                        disabled={viewpoints.length === 0}
                        className="icon-button !w-8 !h-8 disabled:opacity-40 disabled:hover:bg-transparent"
                        title="导出 BCF (JSON)"
                    >
                        <Download size={14} />
                    </button>
                    <label className="icon-button !w-8 !h-8 cursor-pointer" title="导入 BCF (JSON)">
                        <Upload size={14} />
                        <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </label>
                    <button 
                        onClick={() => setIsAdding(true)}
                        className="primary-button !min-h-8 !px-2.5 !py-1 !text-[11px]"
                        title="拍摄新视点"
                    >
                        <Plus size={14} />
                        <span>拍摄</span>
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="m-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Inline Capture Form */}
            {isAdding && (
                <form onSubmit={handleAddViewpoint} className="m-3 control-card flex flex-col gap-3 animate-fade-in-up">
                    <h3 className="panel-section-title !text-slate-800">
                        <Camera size={14} className="text-blue-500" />
                        <span>记录当前相机视点</span>
                    </h3>
                    <div className="flex flex-col gap-1 text-xs">
                        <label className="font-semibold text-slate-500">书签名称</label>
                        <input 
                            type="text" 
                            required 
                            placeholder="如：三层结构柱钢筋重叠冲突"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="input-control px-2.5 py-1.5"
                        />
                    </div>
                    <div className="flex flex-col gap-1 text-xs">
                        <label className="font-semibold text-slate-500">问题批注描述</label>
                        <textarea 
                            rows={2}
                            placeholder="描述具体问题或标注细节..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="input-control px-2.5 py-1.5 resize-none"
                        />
                    </div>
                    {selectedElement && (
                        <div className="text-[10px] text-blue-600 bg-blue-50/50 p-1.5 rounded border border-blue-100 flex flex-col gap-0.5 font-mono">
                            <span className="font-semibold">关联构件：</span>
                            <span>Express ID: #{selectedElement.expressID} ({selectedElement.type})</span>
                        </div>
                    )}
                    <div className="flex justify-end gap-1.5 text-xs font-semibold mt-1">
                        <button 
                            type="button" 
                            onClick={() => setIsAdding(false)}
                            className="secondary-button !min-h-8 !px-3 !py-1.5"
                        >
                            取消
                        </button>
                        <button 
                            type="submit"
                            className="primary-button !min-h-8 !px-3 !py-1.5"
                        >
                            拍摄保存
                        </button>
                    </div>
                </form>
            )}

            {/* List of Viewpoints */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
                {viewpoints.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-2">
                        <Camera size={28} className="text-slate-300 stroke-[1.5]" />
                        <p className="text-xs">暂无视点书签</p>
                        <p className="text-[10px] text-slate-400 max-w-[200px]">点击“拍摄”记录当前相机、构件选择和截图</p>
                    </div>
                ) : (
                    viewpoints.map(vp => (
                        <div 
                            key={vp.id}
                            onClick={() => handleRestore(vp)}
                            className="group relative flex gap-3 p-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg cursor-pointer transition-all duration-150 flex-shrink-0"
                        >
                            {/* Screenshot Thumbnail */}
                            {vp.screenshot ? (
                                <div className="relative w-24 h-16 rounded-lg overflow-hidden border border-slate-200/80 bg-slate-100 flex-shrink-0 shadow-inner">
                                    <img 
                                        src={vp.screenshot} 
                                        alt={vp.title} 
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                    <div className="absolute top-1 left-1 bg-slate-900/70 text-white text-[8px] font-semibold px-1 py-0.5 rounded flex items-center gap-0.5">
                                        <Eye size={8} />
                                        <span>{vp.isWalkMode ? '漫游' : '轴测'}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-24 h-16 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0">
                                    <Camera size={18} className="text-slate-300" />
                                </div>
                            )}

                            {/* Text Info */}
                            <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                <div className="flex flex-col gap-0.5">
                                    <h4 className="text-xs font-semibold text-slate-800 truncate leading-tight group-hover:text-blue-600 transition-colors" title={vp.title}>
                                        {vp.title}
                                    </h4>
                                    <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed" title={vp.comment}>
                                        {vp.comment}
                                    </p>
                                </div>
                                <div className="flex items-center justify-between text-[8px] text-slate-400 font-mono mt-1 select-none">
                                    <span className="flex items-center gap-0.5">
                                        <Clock size={8} />
                                        <span>{new Date(vp.timestamp).toLocaleString('zh-CN', { hour12: false })}</span>
                                    </span>
                                    {vp.guid && (
                                        <span className="text-[8px] text-slate-400 bg-slate-100 px-1 rounded truncate max-w-[80px]" title={`GUID: ${vp.guid}`}>
                                            GUID: {vp.guid}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Quick Delete */}
                            <button
                                onClick={(e) => handleDelete(e, vp.id)}
                                className="icon-button danger-button !w-7 !h-7 absolute top-2 right-2 bg-white/90 opacity-0 group-hover:opacity-100 border border-slate-200"
                                title="删除书签"
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
