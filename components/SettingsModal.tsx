import React from 'react';
import { X } from 'lucide-react';

export interface ViewSettings {
    ifcUpAxis: 'Y' | 'Z';
    glbUpAxis: 'Y' | 'Z';
    shadowQuality: 'high' | 'low' | 'off';
    settingsVersion?: number;
}

export const SETTINGS_VERSION = 3;

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
    ifcUpAxis: 'Z',
    glbUpAxis: 'Y',
    shadowQuality: 'off',
    settingsVersion: SETTINGS_VERSION,
};

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: ViewSettings;
    onSave: (settings: ViewSettings) => void;
}

const SettingSection = ({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: help ? 3 : 0 }}>{label}</div>
            {help && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{help}</div>}
        </div>
        {children}
    </div>
);

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = React.useState<ViewSettings>(settings);

    React.useEffect(() => {
        const migratedSettings = {
            ifcUpAxis: settings.settingsVersion ? (settings.ifcUpAxis || 'Z') : 'Z',
            glbUpAxis: settings.glbUpAxis || 'Y',
            shadowQuality: settings.shadowQuality || 'off',
            settingsVersion: SETTINGS_VERSION,
        } as ViewSettings;
        setLocalSettings(migratedSettings);
    }, [settings, isOpen]);

    if (!isOpen) return null;

    const update = (key: keyof ViewSettings, value: any) =>
        setLocalSettings(prev => ({ ...prev, [key]: value }));

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            zIndex: 'var(--z-modal)' as any,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
        }}>
            <div className="modal-card animate-fade-in-up">
                {/* Header */}
                <div className="modal-header">
                    <span className="modal-title">视图设置</span>
                    <button onClick={onClose} className="icon-button" style={{ width: 28, height: 28 }}>
                        <X size={15} />
                    </button>
                </div>

                {/* Body */}
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                    <SettingSection
                        label="IFC 模型朝向"
                        help="决定导入 IFC 文件时默认的世界坐标向上轴，标准 IFC 应选 Z 轴向上。"
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {[
                                { val: 'Y', label: 'Y 轴向上' },
                                { val: 'Z', label: 'Z 轴向上（标准）' },
                            ].map(({ val, label }) => (
                                <button
                                    key={val}
                                    onClick={() => update('ifcUpAxis', val)}
                                    className={`option-button ${localSettings.ifcUpAxis === val ? 'option-button-active' : ''}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </SettingSection>

                    <SettingSection
                        label="GLB / GLTF 模型朝向"
                        help="glTF 规范使用 Y 轴向上，如遇模型倒置可切换至 Z 轴。"
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {[
                                { val: 'Y', label: 'Y 轴向上（标准）' },
                                { val: 'Z', label: 'Z 轴向上' },
                            ].map(({ val, label }) => (
                                <button
                                    key={val}
                                    onClick={() => update('glbUpAxis', val)}
                                    className={`option-button ${localSettings.glbUpAxis === val ? 'option-button-active' : ''}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </SettingSection>


                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button onClick={onClose} className="secondary-button">取消</button>
                    <button onClick={() => onSave(localSettings)} className="primary-button">保存设置</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
