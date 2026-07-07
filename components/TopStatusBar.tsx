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
    const hasModel = !!fileName;

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

            {/* Center - Removed as requested */}
            <div className="hidden lg:flex items-center justify-center gap-4 flex-1">
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
