import React from 'react';
import { X, Save, Settings } from 'lucide-react';

export interface ViewSettings {
    ifcUpAxis: 'Y' | 'Z';
    glbUpAxis: 'Y' | 'Z';
    shadowQuality: 'high' | 'low' | 'off';
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
    ifcUpAxis: 'Y',
    glbUpAxis: 'Y',
    shadowQuality: 'off'
};

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: ViewSettings;
    onSave: (settings: ViewSettings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = React.useState<ViewSettings>(settings);

    React.useEffect(() => {
        // Handle migration if older settings exist
        const migratedSettings = {
            ifcUpAxis: settings.ifcUpAxis || 'Y',
            glbUpAxis: settings.glbUpAxis || 'Y',
            shadowQuality: settings.shadowQuality || 'off'
        } as ViewSettings;
        setLocalSettings(migratedSettings);
    }, [settings, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="h-14 border-b border-slate-100 flex items-center justify-between px-5 bg-slate-50/50">
                    <div className="flex items-center gap-2 text-slate-800 font-semibold">
                        <Settings className="w-5 h-5 text-blue-600" />
                        系统视图设置
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-6">
                    {/* IFC Settings */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            IFC 模型朝向 (IFC Up-Axis)
                        </label>
                        <p className="text-xs text-slate-500">
                            设置 IFC 文件的默认上方向。通常 Revit/ArchiCAD 等导出的 IFC 默认为 Z 轴向上。
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => setLocalSettings({...localSettings, ifcUpAxis: 'Y'})}
                                className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${localSettings.ifcUpAxis === 'Y' ? 'border-blue-600 bg-blue-50/30 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                            >
                                Y轴向上
                            </button>
                            <button 
                                onClick={() => setLocalSettings({...localSettings, ifcUpAxis: 'Z'})}
                                className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${localSettings.ifcUpAxis === 'Z' ? 'border-blue-600 bg-blue-50/30 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                            >
                                Z轴向上 (标准)
                            </button>
                        </div>
                    </div>

                    {/* GLB Settings */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            GLB/GLTF 模型朝向 (GLB Up-Axis)
                        </label>
                        <p className="text-xs text-slate-500">
                            设置 GLB 或 GLTF 文件的默认上方向。标准 glTF 规范默认 Y 轴为向上轴。
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => setLocalSettings({...localSettings, glbUpAxis: 'Y'})}
                                className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${localSettings.glbUpAxis === 'Y' ? 'border-blue-600 bg-blue-50/30 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                            >
                                Y轴向上 (标准)
                            </button>
                            <button 
                                onClick={() => setLocalSettings({...localSettings, glbUpAxis: 'Z'})}
                                className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${localSettings.glbUpAxis === 'Z' ? 'border-blue-600 bg-blue-50/30 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                            >
                                Z轴向上
                            </button>
                        </div>
                    </div>

                    {/* Shadow Settings */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            阴影渲染质量 (Shadow Quality)
                        </label>
                        <p className="text-xs text-slate-500">
                            选择模型阴影的分辨率。开启阴影能极大增强空间立体感，但在低端设备上可能影响渲染性能。
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            <button 
                                type="button"
                                onClick={() => setLocalSettings({...localSettings, shadowQuality: 'high'})}
                                className={`p-3 rounded-lg border-2 text-xs font-semibold transition-colors ${localSettings.shadowQuality === 'high' ? 'border-blue-600 bg-blue-50/30 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                            >
                                高质量 (2K)
                            </button>
                            <button 
                                type="button"
                                onClick={() => setLocalSettings({...localSettings, shadowQuality: 'low'})}
                                className={`p-3 rounded-lg border-2 text-xs font-semibold transition-colors ${localSettings.shadowQuality === 'low' ? 'border-blue-600 bg-blue-50/30 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                            >
                                低质量 (512px)
                            </button>
                            <button 
                                type="button"
                                onClick={() => setLocalSettings({...localSettings, shadowQuality: 'off'})}
                                className={`p-3 rounded-lg border-2 text-xs font-semibold transition-colors ${localSettings.shadowQuality === 'off' ? 'border-blue-600 bg-blue-50/30 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                            >
                                关闭阴影
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors">
                        取消
                    </button>
                    <button onClick={() => onSave(localSettings)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 shadow-sm shadow-blue-600/20">
                        <Save className="w-4 h-4" />
                        保存设置
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
