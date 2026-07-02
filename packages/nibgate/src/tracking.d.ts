import type { NibgatePageOptions, NibgateResource } from './index.js';

export interface NibgateTrackingGate {
  resource: NibgateResource;
  content(extra?: Record<string, unknown>): void;
  view(extra?: Record<string, unknown>): void;
  track(eventName: string, payload?: Record<string, unknown>): void;
}

export declare function createTrackingGate(resource: NibgateResource | string): NibgateTrackingGate;
export declare function trackResourcePage(resource: NibgateResource | string, options?: NibgatePageOptions): NibgateTrackingGate;
export declare function normalizeResource(resource?: NibgateResource | string): NibgateResource;
export declare function normalizePublisher(value?: unknown, resource?: NibgateResource): NibgateResource['publisher'];
export declare function validateResourceMetadata(resource?: NibgateResource | string, options?: Record<string, unknown>): {
  ok: boolean;
  score: number;
  warnings: string[];
  errors: string[];
};
