import React, { useEffect, useState } from "react";
import { ifcManager } from "../services/ifcManager";
import { Moon, Sun, Camera, Box, Cpu } from "lucide-react";

interface TopStatusBarProps {
  fileName: string | null;
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
  onScreenshot?: () => void;
}

export const TopStatusBar = ({ fileName, isDarkTheme, onToggleTheme, onScreenshot }: TopStatusBarProps) => {
    const [stats, setStats] = useState({ triangles: 0, geometries: 0, memory: 0 });
    const [fps, setFps] = useState(60);
    const [cameraMode, setCameraMode] = useState<"ortho" | "persp" | "walk">("ortho");

    useEffect(() => {
        let frameCount = 0;
        let lastTime = performance.now();
        let rafId: number;
        const countFPS = () => {
            frameCount++;
            const now = performance.now();
            if (now - lastTime >= 1000) {
                setFps(Math.round(frameCount * 1000 / (now - lastTime)));
                frameCount = 0;
                lastTime = now;
            }
            rafId = requestAnimationFrame(countFPS);
        };
        rafId = requestAnimationFrame(countFPS);

        const interval = setInterval(() => {
            const s = ifcManager.getStatistics();
            setStats(s);
            if ((ifcManager as any).isWalking) setCameraMode("walk");
            else if ((ifcManager as any).camera === (ifcManager as any).persCamera) setCameraMode("persp");
            else setCameraMode("ortho");
        }, 1000);

        return () => { clearInterval(interval); cancelAnimationFrame(rafId); };
    }, []);

    const hasModel = !!fileName;
    const fpsCls = fps >= 50 ? "good" : fps >= 30 ? "ok" : "poor";
    const cameraLabel = cameraMode === "walk" ? "\u6f2b\u6e38" : cameraMode === "persp" ? "\u900f\u89c6" : "\u6b63\u4ea4";

    return (
        <div
            className="flex items-center justify-between px-4 select-none z-30 relative flex-shrink-0"
            style={{ height: "var(--topbar-h)", background: "var(--surface-0)", borderBottom: "1px solid var(--border)" }}
        >
            {/* Left: Brand */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex items-center gap-0 leading-none">
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                        BIMVision
                    </span>
                    <span style={{
                        fontSize: 11, fontWeight: 700, color: "var(--brand)",
                        background: "var(--brand-soft)", border: "1px solid var(--brand-border)",
                        borderRadius: "var(--radius-sm)", padding: "1px 5px", marginLeft: 6, letterSpacing: "0.02em",
                    }}>PRO</span>
                </div>
                {hasModel && (
                    <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "2px 10px", background: "var(--surface-1)",
                        border: "1px solid var(--border)", borderRadius: 99, maxWidth: 260,
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                        <span style={{
                            fontSize: 11, fontWeight: 600, color: "var(--text-secondary)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{fileName}</span>
                    </div>
                )}
            </div>

            {/* Center */}
            <div className="hidden lg:flex items-center justify-center gap-4 flex-1">
                {!hasModel ? (
                    <div className="flex items-center gap-5" style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                        {[
                            { key: "\u5de6\u952e", action: "\u65cb\u8f6c" },
                            { key: "\u53f3\u952e", action: "\u5e73\u79fb" },
                            { key: "\u6eda\u8f6e", action: "\u7f29\u653e" },
                            { key: "\u5355\u51fb", action: "\u9009\u62e9" },
                            { key: "\u62d6\u653e", action: "\u52a0\u8f7d\u6587\u4ef6" },
                        ].map(({ key, action }) => (
                            <div key={key} className="flex items-center gap-1.5">
                                <span style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "1px 7px", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>{key}</span>
                                <span>{action}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <span className={`camera-mode-badge ${cameraMode}`}>{cameraLabel}</span>
                        {stats.triangles > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
                                <Box size={11} />
                                <span style={{ fontWeight: 700, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                                    {stats.triangles >= 1000000 ? `${(stats.triangles/1000000).toFixed(2)}M` : `${(stats.triangles/1000).toFixed(1)}k`}
                                </span>
                                <span>\u4e09\u89d2\u9762</span>
                            </div>
                        )}
                        {stats.memory > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
                                <Cpu size={11} />
                                <span style={{ fontWeight: 700, color: "var(--text-secondary)", fontFamily: "monospace" }}>{stats.memory} MB</span>
                            </div>
                        )}
                        <span className={`fps-badge ${fpsCls}`}>{fps} FPS</span>
                    </div>
                )}
            </div>

            {/* Right: Controls */}
            <div className="flex items-center justify-end flex-1 gap-2">
                {onScreenshot && (
                    <button
                        onClick={onScreenshot}
                        title="\u622a\u56fe\u4fdd\u5b58"
                        className="icon-button"
                        style={{ width: 28, height: 28, border: "1px solid var(--border)" }}
                    >
                        <Camera size={13} />
                    </button>
                )}
                {onToggleTheme && (
                    <button
                        onClick={onToggleTheme}
                        title={isDarkTheme ? "\u5207\u6362\u4e3a\u6d45\u8272\u4e3b\u9898" : "\u5207\u6362\u4e3a\u6df1\u8272\u4e3b\u9898"}
                        className="icon-button"
                        style={{ width: 28, height: 28, border: "1px solid var(--border)" }}
                    >
                        {isDarkTheme ? <Sun size={13} /> : <Moon size={13} />}
                    </button>
                )}
            </div>
        </div>
    );
};
