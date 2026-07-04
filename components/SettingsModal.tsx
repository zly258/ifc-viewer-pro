import React from 'react';
import { X } from 'lucide-react';

export interface ViewSettings {
    ifcUpAxis: 'Y' | 'Z';
    glbUpAxis: 'Y' | 'Z';
    shadowQuality: 'high' | 'low' | 'off';
    settingsVersion?: number;
}

export const SETTINGS_VERSION = 2;

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
    ifcUpAxis: 'Z',
    glbUpAxis: 'Y',
    shadowQuality: 'off',
    settingsVersion: SETTINGS_VERSION
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
            ifcUpAxis: settings.settingsVersion ? (settings.ifcUpAxis || 'Z') : 'Z',
            glbUpAxis: settings.glbUpAxis || 'Y',
            shadowQuality: settings.shadowQuality || 'off',
            settingsVersion: SETTINGS_VERSION
        } as ViewSettings;
        setLocalSettings(migratedSettings);
    }, [settings, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="modal-card">
                <div className="modal-header">
                    <div className="modal-title">
                        系统视图设置
                    </div>
                    <button onClick={onClose} className="icon-button !w-8 !h-8">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="modal-body space-y-5">
                    {/* IFC Settings */}
                    <div className="form-section">
                        <label className="section-title">
                            IFC 模型朝向
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => setLocalSettings({...localSettings, ifcUpAxis: 'Y'})}
                                className={`option-button ${localSettings.ifcUpAxis === 'Y' ? 'option-button-active' : ''}`}
                            >
                                Y轴向上
                            </button>
                            <button 
                                onClick={() => setLocalSettings({...localSettings, ifcUpAxis: 'Z'})}
                                className={`option-button ${localSettings.ifcUpAxis === 'Z' ? 'option-button-active' : ''}`}
                            >
                                Z轴向上 (标准)
                            </button>
                        </div>
                    </div>

                    {/* GLB Settings */}
                    <div className="form-section">
                        <label className="section-title">
                            GLB/GLTF 模型朝向
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => setLocalSettings({...localSettings, glbUpAxis: 'Y'})}
                                className={`option-button ${localSettings.glbUpAxis === 'Y' ? 'option-button-active' : ''}`}
                            >
                                Y轴向上 (标准)
                            </button>
                            <button 
                                onClick={() => setLocalSettings({...localSettings, glbUpAxis: 'Z'})}
                                className={`option-button ${localSettings.glbUpAxis === 'Z' ? 'option-button-active' : ''}`}
                            >
                                Z轴向上
                            </button>
                        </div>
                    </div>

                    {/* Shadow Settings */}
                    <div className="form-section">
                        <label className="section-title">
                            阴影渲染质量
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                            <button 
                                type="button"
                                onClick={() => setLocalSettings({...localSettings, shadowQuality: 'high'})}
                                className={`option-button ${localSettings.shadowQuality === 'high' ? 'option-button-active' : ''}`}
                            >
                                高质量 (2K)
                            </button>
                            <button 
                                type="button"
                                onClick={() => setLocalSettings({...localSettings, shadowQuality: 'low'})}
                                className={`option-button ${localSettings.shadowQuality === 'low' ? 'option-button-active' : ''}`}
                            >
                                低质量 (512px)
                            </button>
                            <button 
                                type="button"
                                onClick={() => setLocalSettings({...localSettings, shadowQuality: 'off'})}
                                className={`option-button ${localSettings.shadowQuality === 'off' ? 'option-button-active' : ''}`}
                            >
                                关闭阴影
                            </button>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button onClick={onClose} className="secondary-button">
                        取消
                    </button>
                    <button onClick={() => onSave(localSettings)} className="primary-button">
                        保存设置
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
