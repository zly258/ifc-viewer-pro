import React from 'react';
import { X, Info, Layers, Wrench, BookOpen, Code } from 'lucide-react';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
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
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>关于 BIMVision Pro</h2>
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
                            <Layers size={16} /> 软件介绍
                        </h3>
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                            BIMVision Pro 是一款基于纯前端架构的高性能 IFC 建筑信息模型（BIM）查看器。无需依赖繁重的后端服务，即可在浏览器中实现复杂三维建筑模型的毫秒级解析、超大模型的流畅渲染以及专业级的工程量统计。
                        </p>
                    </section>

                    {/* Controls */}
                    <section>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Wrench size={16} /> 操作说明 (类 CAD/Revit 习惯)
                        </h3>
                        <div style={{ background: 'var(--surface-2)', padding: 16, borderRadius: 'var(--radius-sm)' }}>
                            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)' }}>
                                <li><b>左键点击：</b> 选中构件并高亮显示，查看属性。</li>
                                <li><b>左键拖拽：</b> 旋转视图 (Orbit)。</li>
                                <li><b>中键拖拽：</b> 平移视图 (Pan)。</li>
                                <li><b>Ctrl + 中键拖拽：</b> 旋转视图 (Orbit)。</li>
                                <li><b>滚轮：</b> 缩放视图 (Zoom)。</li>
                                <li><b>右键点击：</b> 显示右键菜单。</li>
                                <li><b>双击构件：</b> 快速聚焦到该构件。</li>
                            </ul>
                        </div>
                    </section>

                    {/* Features */}
                    <section>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <BookOpen size={16} /> 核心功能
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                                <b style={{ display: 'block', marginBottom: 4 }}>高性能渲染</b>
                                支持多线程后台解析，不阻塞主界面。支持数百兆级 IFC 模型渲染。
                            </div>
                            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                                <b style={{ display: 'block', marginBottom: 4 }}>极简工程量统计</b>
                                一键生成基于 IFC 属性的详尽数据清单，支持导出至 Excel。
                            </div>
                            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                                <b style={{ display: 'block', marginBottom: 4 }}>深度空间结构</b>
                                自动解析 `IfcProject` {"->"} `IfcSite` {"->"} `IfcBuilding` {"->"} `IfcBuildingStorey` 的空间关系树。
                            </div>
                            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                                <b style={{ display: 'block', marginBottom: 4 }}>精确测量工具</b>
                                提供坐标、距离、面积和体积的多维测算功能。
                            </div>
                        </div>
                    </section>

                    {/* Tech Stack */}
                    <section>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Code size={16} /> 技术栈
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
