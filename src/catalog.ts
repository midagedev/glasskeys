import catalogJson from '../catalog/keys.json' with { type: 'json' }
import type { KeyId, ModifierId } from './types.js'

/*
 * The catalog, as data.
 *
 * `catalog/keys.json` is the artifact both apps read — the TypeScript here is
 * a typed reader over it, not a second copy. A Swift consumer parses the
 * same file; that is the point, and it is why the JSON ships in the package.
 *
 * An app may know keys the catalog does not (gadak's phone has `pipe` and
 * `tilde`; naru has F1–F12). `repeatable()` answers `false` for those rather
 * than throwing: an unknown key is one this contract has no opinion about,
 * and refusing to run would make the shared machine unusable for the parts
 * of a real key bar that are nobody else's business. Conformance runs on the
 * intersection.
 */

export type CatalogKey = { id: KeyId; repeatable: boolean }

export type Catalog = {
  version: number
  modifiers: ModifierId[]
  keys: CatalogKey[]
}

export const catalog = catalogJson as unknown as Catalog

const byId = new Map(catalog.keys.map((k) => [k.id, k]))

/** Whether holding this key should repeat. Unknown keys: `false`. */
export function repeatable(key: KeyId): boolean {
  return byId.get(key)?.repeatable ?? false
}

/** Whether the shared catalog names this key at all. */
export function isCatalogKey(key: KeyId): boolean {
  return byId.has(key)
}

export const catalogKeys: readonly KeyId[] = catalog.keys.map((k) => k.id)
