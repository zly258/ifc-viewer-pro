import React from 'react';
import { X, Info, Layers, Wrench, BookOpen, Code } from 'lucide-react';
import { useLanguage } from '../locales/LanguageContext';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                background: 'var(--surface-1)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', width: 560, maxWidth: '90vw',
                maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                boxShadow: 'var(--shadow-modal)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 24px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--surface-2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Info size={20} style={{ color: 'var(--brand)' }} />
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t.about.title}</h2>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: 4
                    }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    {/* Intro */}
                    <section>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Layers size={16} /> {t.about.introduction}
                        </h3>
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                            {t.about.introText}
                        </p>
                    </section>

                    {/* Controls */}
                    <section>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Wrench size={16} /> {t.about.operations}
                        </h3>
                        <div style={{ background: 'var(--surface-2)', padding: 16, borderRadius: 'var(--radius-sm)' }}>
                            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)' }}>
                                <li><b>{t.about.leftClick}：</b> {t.about.leftClickDesc}</li>
                                <li><b>{t.about.middleDrag}：</b> {t.about.middleDragDesc}</li>
                                <li><b>{t.about.ctrlMiddle}：</b> {t.about.ctrlMiddleDesc}</li>
                                <li><b>{t.about.scroll}：</b> {t.about.scrollDesc}</li>
                                <li><b>{t.about.rightClick}：</b> {t.about.rightClickDesc}</li>
                                <li><b>{t.about.doubleClick}：</b> {t.about.doubleClickDesc}</li>
                            </ul>
                        </div>
                    </section>

                    {/* Features */}
                    <section>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <BookOpen size={16} /> {t.about.features}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                                <b style={{ display: 'block', marginBottom: 4 }}>{t.about.featureRendering}</b>
                                {t.about.featureRenderingDesc}
                            </div>
                            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                                <b style={{ display: 'block', marginBottom: 4 }}>{t.about.featureQuantities}</b>
                                {t.about.featureQuantitiesDesc}
                            </div>
                            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                                <b style={{ display: 'block', marginBottom: 4 }}>{t.about.featureStructure}</b>
                                {t.about.featureStructureDesc}
                            </div>
                            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                                <b style={{ display: 'block', marginBottom: 4 }}>{t.about.featureMeasure}</b>
                                {t.about.featureMeasureDesc}
                            </div>
                        </div>
                    </section>

                    {/* Tech Stack */}
                    <section>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Code size={16} /> {t.about.techStack}
                        </h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {['React 18', 'TypeScript', 'Three.js', 'Web-IFC', 'Web Workers', 'Vite', 'Lucide Icons'].map(tech => (
                                <span key={tech} style={{
                                    background: 'var(--brand-soft)', color: 'var(--brand)',
                                    padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500
                                }}>
                                    {tech}
                                </span>
                            ))}
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
};

export default AboutModal;
