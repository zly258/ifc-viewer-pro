import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useLanguage, Language } from '../locales/LanguageContext';
import { cacheManager } from '../services/CacheManager';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export interface ViewSettings {
    shadowQuality: 'high' | 'low' | 'off';
    enableHoverHighlight: boolean;
    themeMode: 'light' | 'dark';
    language: Language;
    settingsVersion?: number;
}

export const SETTINGS_VERSION = 5;

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
    shadowQuality: 'off',
    enableHoverHighlight: true,
    themeMode: 'light',
    language: 'zh',
    settingsVersion: SETTINGS_VERSION,
};

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

    // ── Cache section state ──
    const [cacheInfo, setCacheInfo] = useState<{ count: number; bytes: number } | null>(null);
    const [loadingCache, setLoadingCache] = useState(false);
    const [confirmClearCache, setConfirmClearCache] = useState(false);
    const [cacheToast, setCacheToast] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setLoadingCache(true);
        setConfirmClearCache(false);
        cacheManager.getSize()
            .then(info => { if (!cancelled) setCacheInfo(info); })
            .catch(() => { if (!cancelled) setCacheInfo({ count: 0, bytes: 0 }); })
            .finally(() => { if (!cancelled) setLoadingCache(false); });
        return () => { cancelled = true; };
    }, [isOpen]);

    const handleClearCache = useCallback(async () => {
        try {
            await cacheManager.clear();
            setCacheInfo({ count: 0, bytes: 0 });
            setCacheToast(t.settings.cacheCleared);
            setConfirmClearCache(false);
            setTimeout(() => setCacheToast(null), 2600);
        } catch (e) {
            console.warn('Clear cache failed:', e);
        }
    }, [t]);

    useEffect(() => {
        const migratedSettings = {
            shadowQuality: settings.shadowQuality || 'off',
            enableHoverHighlight: (settings as any).settingsVersion && (settings as any).settingsVersion >= 4 ? (settings.enableHoverHighlight ?? true) : true,
            themeMode: ((settings as any).themeMode || 'light') as 'light' | 'dark',
            language: ((settings as any).language || lang) as Language,
            settingsVersion: SETTINGS_VERSION,
        } as ViewSettings;
        setLocalSettings(migratedSettings);
    }, [settings, isOpen]);

    const handleSave = useCallback(() => {
        // Apply theme mode immediately
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

                    {/* Cache */}
                    <SettingSection
                        label={t.settings.cache}
                        help={t.settings.cacheHelp}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                                <div>
                                    {t.settings.cacheSize}：<strong style={{ color: 'var(--text-primary)' }}>
                                        {loadingCache ? '…' : formatBytes(cacheInfo?.bytes ?? 0)}
                                    </strong>
                                </div>
                                <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                                    {t.settings.cacheEntries}：{loadingCache ? '…' : (cacheInfo?.count ?? 0)}
                                </div>
                            </div>
                            {confirmClearCache ? (
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => setConfirmClearCache(false)} className="secondary-button">{t.app.cancel}</button>
                                    <button onClick={handleClearCache} className="danger-primary-button">{t.settings.confirmClearCache}</button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmClearCache(true)}
                                    disabled={(cacheInfo?.count ?? 0) === 0}
                                    className="cache-clear-btn"
                                >
                                    {t.settings.clearCache}
                                </button>
                            )}
                        </div>
                        {cacheToast && (
                            <div className="cache-toast">{cacheToast}</div>
                        )}
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
