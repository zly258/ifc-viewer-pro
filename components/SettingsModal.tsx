import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useLanguage, Language } from '../locales/LanguageContext';

// Theme color presets: name → { brand, hover, soft, border }
const THEME_PRESETS = [
    { id: 'blue',    brand: '#2563eb', hover: '#1d4ed8', soft: '#eff6ff', border: '#bfdbfe' },
    { id: 'green',   brand: '#16a34a', hover: '#15803d', soft: '#f0fdf4', border: '#bbf7d0' },
    { id: 'purple',  brand: '#7c3aed', hover: '#6d28d9', soft: '#f5f3ff', border: '#ddd6fe' },
    { id: 'orange',  brand: '#ea580c', hover: '#c2410c', soft: '#fff7ed', border: '#fed7aa' },
    { id: 'teal',    brand: '#0d9488', hover: '#0f766e', soft: '#f0fdfa', border: '#99f6e4' },
    { id: 'rose',    brand: '#e11d48', hover: '#be123c', soft: '#fff1f2', border: '#fecdd3' },
] as const;

export type ThemeColorId = typeof THEME_PRESETS[number]['id'];

export interface ViewSettings {
    shadowQuality: 'high' | 'low' | 'off';
    enableHoverHighlight: boolean;
    themeColor: ThemeColorId;
    themeMode: 'light' | 'dark';
    language: Language;
    settingsVersion?: number;
}

export const SETTINGS_VERSION = 5;

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
    shadowQuality: 'off',
    enableHoverHighlight: true,
    themeColor: 'blue',
    themeMode: 'light',
    language: 'zh',
    settingsVersion: SETTINGS_VERSION,
};

/** Apply a theme color preset to :root / [data-theme] CSS variables */
export function applyThemeColor(colorId: ThemeColorId, themeMode: 'light' | 'dark') {
    const preset = THEME_PRESETS.find(p => p.id === colorId) || THEME_PRESETS[0];
    const root = themeMode === 'dark'
        ? document.querySelector('[data-theme="dark"]') as HTMLElement | null
        : document.documentElement;
    const target = root || document.documentElement;
    target.style.setProperty('--brand', preset.brand);
    target.style.setProperty('--brand-hover', preset.hover);
    target.style.setProperty('--brand-soft', preset.soft);
    target.style.setProperty('--brand-border', preset.border);
    target.style.setProperty('--accent', preset.brand);
}

/** Apply theme mode (light/dark) */
export function applyThemeMode(mode: 'light' | 'dark') {
    if (mode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

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
    const { t, lang, setLanguage } = useLanguage();
    const [localSettings, setLocalSettings] = useState<ViewSettings>(settings);

    useEffect(() => {
        const migratedSettings = {
            shadowQuality: settings.shadowQuality || 'off',
            enableHoverHighlight: (settings as any).settingsVersion && (settings as any).settingsVersion >= 4 ? (settings.enableHoverHighlight ?? true) : true,
            themeColor: ((settings as any).themeColor || 'blue') as ThemeColorId,
            themeMode: ((settings as any).themeMode || 'light') as 'light' | 'dark',
            language: ((settings as any).language || lang) as Language,
            settingsVersion: SETTINGS_VERSION,
        } as ViewSettings;
        setLocalSettings(migratedSettings);
    }, [settings, isOpen]);

    const handleSave = useCallback(() => {
        // Apply theme color & mode immediately
        applyThemeColor(localSettings.themeColor, localSettings.themeMode);
        applyThemeMode(localSettings.themeMode);
        // Apply language
        setLanguage(localSettings.language);
        onSave(localSettings);
    }, [localSettings, onSave, setLanguage]);

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
                    <span className="modal-title">{t.settings.title}</span>
                    <button onClick={onClose} className="icon-button" style={{ width: 28, height: 28 }}>
                        <X size={15} />
                    </button>
                </div>

                {/* Body */}
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                    {/* Theme Color */}
                    <SettingSection
                        label={t.settings.themeColor}
                        help={t.settings.themeColorHelp}
                    >
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {THEME_PRESETS.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => update('themeColor', p.id)}
                                    title={p.id}
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        background: p.brand,
                                        border: localSettings.themeColor === p.id
                                            ? `3px solid var(--text-primary)`
                                            : '3px solid transparent',
                                        boxShadow: localSettings.themeColor === p.id
                                            ? `0 0 0 2px ${p.brand}40`
                                            : 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        outline: 'none',
                                    }}
                                />
                            ))}
                        </div>
                    </SettingSection>

                    {/* Theme Mode (Light/Dark) */}
                    <SettingSection
                        label={t.settings.themeMode}
                        help={t.settings.themeModeHelp}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {[
                                { val: 'light', label: t.settings.light },
                                { val: 'dark', label: t.settings.dark },
                            ].map(({ val, label }) => (
                                <button
                                    key={val}
                                    onClick={() => update('themeMode', val)}
                                    className={`option-button ${localSettings.themeMode === val ? 'option-button-active' : ''}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </SettingSection>

                    {/* Language */}
                    <SettingSection
                        label={t.settings.language}
                        help={t.settings.languageHelp}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {[
                                { val: 'zh', label: '中文' },
                                { val: 'en', label: 'English' },
                            ].map(({ val, label }) => (
                                <button
                                    key={val}
                                    onClick={() => update('language', val)}
                                    className={`option-button ${localSettings.language === val ? 'option-button-active' : ''}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </SettingSection>

                    {/* Shadow Quality */}
                    <SettingSection
                        label={t.settings.shadowQuality}
                        help={t.settings.shadowQualityHelp}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                            {[
                                { val: 'off', label: t.settings.off },
                                { val: 'low', label: t.settings.low },
                                { val: 'high', label: t.settings.high },
                            ].map(({ val, label }) => (
                                <button
                                    key={val}
                                    onClick={() => update('shadowQuality', val)}
                                    className={`option-button ${localSettings.shadowQuality === val ? 'option-button-active' : ''}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </SettingSection>

                    <SettingSection
                        label={t.settings.hoverHighlight}
                        help={t.settings.hoverHighlightHelp}
                    >
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            cursor: 'pointer',
                            userSelect: 'none',
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                        }}>
                            <div style={{
                                position: 'relative',
                                width: 36,
                                height: 20,
                                borderRadius: 10,
                                background: localSettings.enableHoverHighlight ? 'var(--accent)' : 'var(--border)',
                                transition: 'background 0.2s',
                            }}>
                                <div style={{
                                    position: 'absolute',
                                    top: 2,
                                    left: localSettings.enableHoverHighlight ? 18 : 2,
                                    width: 16,
                                    height: 16,
                                    borderRadius: '50%',
                                    background: '#fff',
                                    transition: 'left 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                }} />
                            </div>
                            <span>{localSettings.enableHoverHighlight ? t.settings.enabled : t.settings.disabled}</span>
                            <input
                                type="checkbox"
                                checked={localSettings.enableHoverHighlight}
                                onChange={e => update('enableHoverHighlight', e.target.checked)}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </SettingSection>

                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button onClick={onClose} className="secondary-button">{t.settings.cancel}</button>
                    <button onClick={handleSave} className="primary-button">{t.settings.save}</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
