
import React from 'react';
import { MeasurementResult } from '../types';
import { Trash2, Ruler, DraftingCompass, MapPin } from 'lucide-react';
import { ifcManager } from '../services/ifcManager';

interface MeasurementPanelProps {
    measurements: MeasurementResult[];
    onClear?: () => void;
}

const MeasurementPanel: React.FC<MeasurementPanelProps> = ({ measurements, onClear }) => {
    
    const handleDelete = (id: string) => {
        ifcManager.measurementManager?.deleteMeasurement(id);
        ifcManager.renderScene();
    };

    const handleClearAll = () => {
        if (ifcManager.measurementManager) {
            ifcManager.measurementManager.clear();
            ifcManager.renderScene();
            // Force UI update via callback if provided
            if (onClear) onClear();
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'DISTANCE': return <Ruler size={14} />;
            case 'ANGLE': return <DraftingCompass size={14} />;
            case 'COORDINATE': return <MapPin size={14} />;
            default: return <Ruler size={14} />;
        }
    };

    const getLabel = (type: string) => {
        switch (type) {
            case 'DISTANCE': return '距离 (长度)';
            case 'ANGLE': return '角度';
            case 'COORDINATE': return '坐标';
            default: return type;
        }
    };

    if (measurements.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 bg-white">
                <Ruler size={32} className="mb-3 opacity-20" />
                <p className="text-xs">暂无测量结果</p>
                <p className="text-[10px] opacity-70 mt-1">请使用底部工具栏进行测量</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {measurements.map(m => (
                    <div key={m.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex items-start justify-between group hover:border-blue-200 hover:shadow-sm transition-all">
                        <div className="flex gap-3">
                            <div className="mt-0.5 text-blue-500 bg-blue-50 p-1.5 rounded">
                                {getIcon(m.type)}
                            </div>
                            <div>
                                <div className="text-xs font-bold text-slate-700 mb-0.5">{getLabel(m.type)}</div>
                                <div className="text-sm font-mono text-slate-900 whitespace-pre-wrap">{m.value}</div>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleDelete(m.id)}
                            className="text-slate-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>
            <div className="p-3 border-t border-slate-100 bg-slate-50">
                 <button 
                    onClick={handleClearAll}
                    className="w-full py-2 text-xs text-red-500 hover:bg-red-50 border border-red-100 rounded-lg transition-colors flex items-center justify-center gap-2"
                 >
                     <Trash2 size={14} /> 清空所有测量
                 </button>
            </div>
        </div>
    );
};

export default MeasurementPanel;
