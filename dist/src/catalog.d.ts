import type { KeyId, ModifierId } from './types.js';
export type CatalogKey = {
    id: KeyId;
    repeatable: boolean;
};
export type Catalog = {
    version: number;
    modifiers: ModifierId[];
    keys: CatalogKey[];
};
export declare const catalog: Catalog;
/** Whether holding this key should repeat. Unknown keys: `false`. */
export declare function repeatable(key: KeyId): boolean;
/** Whether the shared catalog names this key at all. */
export declare function isCatalogKey(key: KeyId): boolean;
export declare const catalogKeys: readonly KeyId[];
