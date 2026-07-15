import { ViewerTool } from '../types';

/**
 * Typed application event bus.
 *
 * Replaces the previous stringly-typed `window.dispatchEvent(new CustomEvent(...))`
 * chatter with a single, fully-typed emitter. Listeners get payloads with the
 * correct shape and the compiler catches typos in event names or payloads.
 */
export interface ViewerEventMap {
  'model-loaded': void;
  'viewer-contextmenu': { x: number; y: number; hit: { modelID: number; expressID: number } | null };
  'viewer-isolation-changed': { isIsolated: boolean };
  'viewer-elements-changed': void;
  'tool-changed': { tool: ViewerTool };
  'open-measure-panel': void;
  'zoom-to-measurement': { id: string };
  'annotation-focus': { target: { x: number; y: number; z: number } };
}

type Handler<T> = (payload: T) => void;

class TypedEventBus {
  private listeners: { [K in keyof ViewerEventMap]?: Set<Handler<ViewerEventMap[K]>> } = {};

  on<K extends keyof ViewerEventMap>(event: K, handler: Handler<ViewerEventMap[K]>): () => void {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event]!.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof ViewerEventMap>(event: K, handler: Handler<ViewerEventMap[K]>): void {
    this.listeners[event]?.delete(handler);
  }

  emit<K extends keyof ViewerEventMap>(event: K, payload: ViewerEventMap[K]): void {
    this.listeners[event]?.forEach((h) => h(payload));
  }
}

export const eventBus = new TypedEventBus();
