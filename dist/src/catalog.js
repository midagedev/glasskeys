import catalogJson from '../catalog/keys.json' with { type: 'json' };
export const catalog = catalogJson;
const byId = new Map(catalog.keys.map((k) => [k.id, k]));
/** Whether holding this key should repeat. Unknown keys: `false`. */
export function repeatable(key) {
    return byId.get(key)?.repeatable ?? false;
}
/** Whether the shared catalog names this key at all. */
export function isCatalogKey(key) {
    return byId.has(key);
}
export const catalogKeys = catalog.keys.map((k) => k.id);
