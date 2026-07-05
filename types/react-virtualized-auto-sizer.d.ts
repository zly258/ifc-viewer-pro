/**
 * Type declarations for react-virtualized-auto-sizer.
 * The package ships a CommonJS bundle without proper ESM/TS declarations.
 */
declare module 'react-virtualized-auto-sizer' {
    import type { ComponentType } from 'react';

    export interface AutoSizerProps {
        children: (size: { height: number; width: number }) => React.ReactNode;
        defaultHeight?: number;
        defaultWidth?: number;
        disableHeight?: boolean;
        disableWidth?: boolean;
        onResize?: (size: { height: number; width: number }) => void;
        style?: React.CSSProperties;
        className?: string;
    }

    const AutoSizer: ComponentType<AutoSizerProps>;
    export default AutoSizer;
}
