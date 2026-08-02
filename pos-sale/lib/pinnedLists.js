// Named pinned-product lists for the POS quick-add rail.
//
// Replaces the single flat pinned array with any number of NAMED lists, so a
// till can keep "Bags & Packaging", "Cold Drinks" and "Today's Promo" side by
// side instead of one 12-item pile. Everything stays in localStorage scoped to
// (branch, desk) — a pinned set is a property of the physical till, not of the
// user, and it must keep working when the network doesn't.
//
// Stored shape (v2), under `pos.pinnedLists.<branch>.<desk>`:
//   { version: 2, activeId: 'l_x', lists: [ { id, name, items: [entry] } ] }
// where entry = { name, productId, price, thumb }.
//
// v1 was a bare array under `pos.pinnedProducts.<branch>.<desk>`. loadState()
// migrates it into a single list on first read — tellers keep their pins.

import { StraipImageUrl, isImage } from '@rutba/api-provider/lib/api';

export const PINNED_CHANGED_EVENT = 'pos.pinnedChanged';

export const MAX_ITEMS_PER_LIST = 24;
export const MAX_LISTS = 12;
const DEFAULT_LIST_NAME = 'Pinned';
const STORAGE_VERSION = 2;

/* ─────────────────────────── entry helpers ─────────────────────────── */

/** Product → best thumbnail. Prefers the explicit logo, falls back to gallery. */
export function productThumbUrl(product) {
    if (!product) return null;
    const pick = (file) => {
        if (!file || !isImage(file)) return null;
        const thumb = file.formats?.thumbnail || file;
        return StraipImageUrl(thumb);
    };
    return pick(product.logo)
        || pick(Array.isArray(product.gallery) ? product.gallery.find(isImage) : null);
}

/** Identity of an entry. productId when we have one, else the name — the same
 *  rule the recent list uses, so the two stay comparable. */
export function entryKeyOf(entry) {
    return entry?.productId || entry?.name;
}

/** Build a pinnable entry from a search-result stock item. */
export function entryFromStockItem(stockItem) {
    if (!stockItem) return null;
    const name = stockItem.product?.name || stockItem.name;
    if (!name) return null;
    return {
        name,
        productId: stockItem.product?.documentId || stockItem.product?.id || null,
        price: Number(stockItem.selling_price || 0),
        thumb: productThumbUrl(stockItem.product),
    };
}

/* ─────────────────────────── storage ─────────────────────────── */

function scopeOf(branch, desk) {
    return `${branch?.id || branch?.documentId || 'no-branch'}.${desk?.id || 'no-desk'}`;
}
function listsKey(branch, desk) { return `pos.pinnedLists.${scopeOf(branch, desk)}`; }
function legacyKey(branch, desk) { return `pos.pinnedProducts.${scopeOf(branch, desk)}`; }

// Not crypto — just needs to be unique within one till's localStorage. Date.now
// alone collides when two lists are created in the same millisecond (rename +
// create in a loop), so mix in a counter.
let idSeq = 0;
function newListId() {
    idSeq += 1;
    return `l${Date.now().toString(36)}${idSeq.toString(36)}`;
}

function emptyState() {
    const id = newListId();
    return {
        version: STORAGE_VERSION,
        activeId: id,
        lists: [{ id, name: DEFAULT_LIST_NAME, items: [] }],
    };
}

/** Coerce whatever is in storage into a valid state. Never throws, never
 *  returns a state with zero lists — the panel and manager both assume at
 *  least one exists. */
function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.lists) || raw.lists.length === 0) {
        return emptyState();
    }
    const lists = raw.lists
        .filter(l => l && typeof l === 'object')
        .map(l => ({
            id: String(l.id || newListId()),
            name: String(l.name || DEFAULT_LIST_NAME).slice(0, 40),
            items: Array.isArray(l.items)
                ? l.items.filter(e => e && (e.productId || e.name)).slice(0, MAX_ITEMS_PER_LIST)
                : [],
        }))
        .slice(0, MAX_LISTS);
    if (lists.length === 0) return emptyState();
    const activeId = lists.some(l => l.id === raw.activeId) ? raw.activeId : lists[0].id;
    return { version: STORAGE_VERSION, activeId, lists };
}

/** A brand-new state, PERSISTED before it is handed out.
 *
 *  Persisting matters: list ids are generated, so if we returned an unsaved
 *  default the next loadState() would mint different ids. A caller that held
 *  the first state (the panel does — `activeList.id`) would then address a list
 *  that no longer exists, and the very first pin on a fresh till would be
 *  silently dropped. */
function freshState(branch, desk) {
    const s = emptyState();
    saveState(branch, desk, s);
    return s;
}

export function loadState(branch, desk) {
    try {
        const raw = localStorage.getItem(listsKey(branch, desk));
        if (raw) {
            const parsed = JSON.parse(raw);
            const norm = normalize(parsed);
            // normalize() invents ids for anything stored without one (and for a
            // degenerate value, a whole default list). Those must be written back
            // for the same reason freshState() persists — otherwise the next read
            // invents different ones and callers holding an id address nothing.
            const storedIds = new Set(
                (Array.isArray(parsed?.lists) ? parsed.lists : []).map(l => l && l.id).filter(Boolean)
            );
            if (norm.lists.some(l => !storedIds.has(l.id))) saveState(branch, desk, norm);
            return norm;
        }
    } catch { /* unparseable — fall through to migration/empty */ }

    // v1 migration: a bare array of entries becomes one list, keeping its order.
    try {
        const legacyRaw = localStorage.getItem(legacyKey(branch, desk));
        if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw);
            if (Array.isArray(legacy) && legacy.length) {
                const id = newListId();
                const migrated = {
                    version: STORAGE_VERSION,
                    activeId: id,
                    lists: [{ id, name: DEFAULT_LIST_NAME, items: legacy.slice(0, MAX_ITEMS_PER_LIST) }],
                };
                // Write the new key BEFORE dropping the old one, so a failure
                // here can never lose the teller's pins.
                saveState(branch, desk, migrated);
                try { localStorage.removeItem(legacyKey(branch, desk)); } catch { /* leave it */ }
                return migrated;
            }
        }
    } catch { /* ignore — start fresh */ }

    return freshState(branch, desk);
}

export function saveState(branch, desk, state) {
    try {
        localStorage.setItem(listsKey(branch, desk), JSON.stringify(normalize(state)));
    } catch { /* quota — the pin just doesn't persist; never break the sale */ }
}

/** Tell every mounted component to re-read. localStorage's own `storage` event
 *  does not fire in the tab that wrote, so we route through a DOM event. */
export function notifyChanged(branch, desk) {
    try {
        window.dispatchEvent(new CustomEvent(PINNED_CHANGED_EVENT, {
            detail: { scope: scopeOf(branch, desk) },
        }));
    } catch { /* SSR — silent */ }
}

function mutate(branch, desk, fn) {
    const state = loadState(branch, desk);
    const next = fn(state) || state;
    saveState(branch, desk, next);
    notifyChanged(branch, desk);
    return normalize(next);
}

/* ─────────────────────────── list operations ─────────────────────────── */

export function createList(branch, desk, name) {
    let created = null;
    mutate(branch, desk, (s) => {
        if (s.lists.length >= MAX_LISTS) return s;
        created = { id: newListId(), name: String(name || 'New list').trim().slice(0, 40) || 'New list', items: [] };
        return { ...s, lists: [...s.lists, created], activeId: created.id };
    });
    return created;
}

export function renameList(branch, desk, listId, name) {
    return mutate(branch, desk, (s) => ({
        ...s,
        lists: s.lists.map(l => (l.id === listId
            ? { ...l, name: String(name || '').trim().slice(0, 40) || l.name }
            : l)),
    }));
}

/** Delete a list. Deleting the last one leaves a fresh empty default rather
 *  than an unusable zero-list state. */
export function deleteList(branch, desk, listId) {
    return mutate(branch, desk, (s) => {
        const lists = s.lists.filter(l => l.id !== listId);
        if (lists.length === 0) return emptyState();
        const activeId = s.activeId === listId ? lists[0].id : s.activeId;
        return { ...s, lists, activeId };
    });
}

export function setActiveList(branch, desk, listId) {
    return mutate(branch, desk, (s) => (
        s.lists.some(l => l.id === listId) ? { ...s, activeId: listId } : s
    ));
}

/** Move a list left/right in the tab order. */
export function moveList(branch, desk, listId, delta) {
    return mutate(branch, desk, (s) => {
        const i = s.lists.findIndex(l => l.id === listId);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= s.lists.length) return s;
        const lists = [...s.lists];
        [lists[i], lists[j]] = [lists[j], lists[i]];
        return { ...s, lists };
    });
}

/* ─────────────────────────── item operations ─────────────────────────── */

export function addEntry(branch, desk, listId, entry) {
    if (!entry) return null;
    const k = entryKeyOf(entry);
    return mutate(branch, desk, (s) => ({
        ...s,
        lists: s.lists.map(l => (l.id === listId
            ? { ...l, items: [entry, ...l.items.filter(e => entryKeyOf(e) !== k)].slice(0, MAX_ITEMS_PER_LIST) }
            : l)),
    }));
}

export function removeEntry(branch, desk, listId, key) {
    return mutate(branch, desk, (s) => ({
        ...s,
        lists: s.lists.map(l => (l.id === listId
            ? { ...l, items: l.items.filter(e => entryKeyOf(e) !== key) }
            : l)),
    }));
}

/** Move an item between lists. A no-op if the target already holds it, so a
 *  double-click can't duplicate an entry. */
export function moveEntry(branch, desk, fromListId, toListId, key) {
    if (fromListId === toListId) return loadState(branch, desk);
    return mutate(branch, desk, (s) => {
        const from = s.lists.find(l => l.id === fromListId);
        const entry = from?.items.find(e => entryKeyOf(e) === key);
        if (!entry) return s;
        return {
            ...s,
            lists: s.lists.map(l => {
                if (l.id === fromListId) return { ...l, items: l.items.filter(e => entryKeyOf(e) !== key) };
                if (l.id === toListId) {
                    return {
                        ...l,
                        items: [...l.items.filter(e => entryKeyOf(e) !== key), entry].slice(0, MAX_ITEMS_PER_LIST),
                    };
                }
                return l;
            }),
        };
    });
}

/** Reorder within a list — tellers put their fastest movers at the top. */
export function moveEntryWithin(branch, desk, listId, key, delta) {
    return mutate(branch, desk, (s) => ({
        ...s,
        lists: s.lists.map(l => {
            if (l.id !== listId) return l;
            const i = l.items.findIndex(e => entryKeyOf(e) === key);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= l.items.length) return l;
            const items = [...l.items];
            [items[i], items[j]] = [items[j], items[i]];
            return { ...l, items };
        }),
    }));
}

/* ─────────── cross-component API (search dropdown, etc.) ─────────── */

/** Which lists hold this product? */
export function listsContaining(branch, desk, stockItem) {
    const entry = entryFromStockItem(stockItem);
    if (!entry) return [];
    const k = entryKeyOf(entry);
    return loadState(branch, desk).lists.filter(l => l.items.some(e => entryKeyOf(e) === k));
}

/** Pinned ANYWHERE — the search dropdown shows one pin icon, so it must not
 *  read as "unpinned" just because the item lives in a non-active list. */
export function isProductPinned(branch, desk, stockItem) {
    return listsContaining(branch, desk, stockItem).length > 0;
}

/**
 * Toggle from anywhere. Pinned in any list → remove from ALL of them (the icon
 * said "pinned", so clicking it must leave nothing behind). Otherwise add to
 * the active list.
 * @returns {boolean} the new pinned state
 */
export function togglePinForStockItem(branch, desk, stockItem) {
    const entry = entryFromStockItem(stockItem);
    if (!entry) return false;
    const k = entryKeyOf(entry);
    const state = loadState(branch, desk);
    const pinnedSomewhere = state.lists.some(l => l.items.some(e => entryKeyOf(e) === k));

    mutate(branch, desk, (s) => {
        if (pinnedSomewhere) {
            return { ...s, lists: s.lists.map(l => ({ ...l, items: l.items.filter(e => entryKeyOf(e) !== k) })) };
        }
        const targetId = s.lists.some(l => l.id === s.activeId) ? s.activeId : s.lists[0].id;
        return {
            ...s,
            lists: s.lists.map(l => (l.id === targetId
                ? { ...l, items: [entry, ...l.items.filter(e => entryKeyOf(e) !== k)].slice(0, MAX_ITEMS_PER_LIST) }
                : l)),
        };
    });

    return !pinnedSomewhere;
}
