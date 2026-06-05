import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    CmsMenusEndpoints,
    CmsMenuItemsEndpoints,
    CmsPagesEndpoints,
    CmsPageGroupsEndpoints,
    ProductGroupsEndpoints,
    CategoryGroupsEndpoints,
    BrandGroupsEndpoints,
} from "@rutba/api-provider/endpoints";
import Link from "next/link";
import { useToast } from "../../components/Toast";
import PagePickerTabs from "../../components/PagePickerTabs";
import { toOrderedRelation } from "../../components/orderedRelation";

const POSITION_OPTIONS = [
    { value: "top", label: "Top (header)" },
    { value: "side", label: "Side (drawer)" },
    { value: "footer", label: "Footer" },
];

const KIND_OPTIONS = [
    { value: "cms_page", label: "CMS Page" },
    { value: "page_group", label: "Page Group" },
    { value: "product_group", label: "Product Group" },
    { value: "collection", label: "Collection (slug)" },
    { value: "url", label: "External / manual URL" },
    { value: "mega", label: "Mega panel (brands / categories)" },
];

// A blank local item. `key` is a stable client id; `documentId` is null until
// the row has been persisted to Strapi.
function blankItem(key, parentKey, order) {
    return {
        key, documentId: null, parentKey, order,
        label: "", link_kind: "url", url: "", collection_slug: "",
        cms_page: "", page_group: "", product_group: "",
        mega_category_group: "", mega_brand_group: "", open_in_new: false,
    };
}

// Strapi update/create payload for one item. Single (manyToOne) relations are
// sent as a plain documentId string or null (matches the cms-page → footer
// convention); only the relation matching link_kind is set, the rest cleared.
function buildItemPayload(it, menuDocId, parentDocId) {
    return {
        label: it.label,
        order: it.order,
        open_in_new: it.open_in_new,
        link_kind: it.link_kind,
        url: it.link_kind === "url" ? (it.url || null) : null,
        collection_slug: it.link_kind === "collection" ? (it.collection_slug || null) : null,
        cms_page: it.link_kind === "cms_page" ? (it.cms_page || null) : null,
        page_group: it.link_kind === "page_group" ? (it.page_group || null) : null,
        product_group: it.link_kind === "product_group" ? (it.product_group || null) : null,
        mega_category_group: it.link_kind === "mega" ? (it.mega_category_group || null) : null,
        mega_brand_group: it.link_kind === "mega" ? (it.mega_brand_group || null) : null,
        menu: menuDocId,
        parent: parentDocId || null,
    };
}

// Renumber `order` to 0..n within each parent group.
function renumber(items) {
    const byParent = {};
    for (const it of items) {
        const k = it.parentKey || "__root__";
        (byParent[k] = byParent[k] || []).push(it);
    }
    const out = [];
    for (const group of Object.values(byParent)) {
        group.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        group.forEach((it, i) => out.push({ ...it, order: i }));
    }
    return out;
}

function RelationSelect({ label, value, onChange, options, labelKey = "name", placeholder }) {
    return (
        <div className="mb-2">
            <label className="form-label small mb-1">{label}</label>
            <select className="form-select form-select-sm" value={value} onChange={(e) => onChange(e.target.value)}>
                <option value="">{placeholder || "— select —"}</option>
                {options.map((o) => (
                    <option key={o.documentId} value={o.documentId}>
                        {o[labelKey]}{o.page_type ? ` (${o.page_type})` : ""}
                    </option>
                ))}
            </select>
        </div>
    );
}

// One editable item row. Defined at module scope so typing doesn't remount it.
function ItemEditorCard({ item, candidates, isChild, canUp, canDown, onChange, onMove, onRemove, onAddSub }) {
    const set = (patch) => onChange(item.key, patch);
    const k = item.link_kind;

    return (
        <div className={`border rounded p-2 mb-2 ${isChild ? "bg-light" : "bg-white"}`}>
            <div className="d-flex align-items-center gap-2 mb-2">
                {isChild && <i className="fas fa-level-up-alt fa-rotate-90 text-muted"></i>}
                <input
                    type="text"
                    className="form-control form-control-sm"
                    value={item.label}
                    onChange={(e) => set({ label: e.target.value })}
                    placeholder="Label shown in the nav"
                />
                <div className="btn-group btn-group-sm flex-shrink-0">
                    <button type="button" className="btn btn-outline-secondary" disabled={!canUp} onClick={() => onMove(item.key, "up")} title="Move up"><i className="fas fa-arrow-up"></i></button>
                    <button type="button" className="btn btn-outline-secondary" disabled={!canDown} onClick={() => onMove(item.key, "down")} title="Move down"><i className="fas fa-arrow-down"></i></button>
                    <button type="button" className="btn btn-outline-danger" onClick={() => onRemove(item.key)} title="Remove"><i className="fas fa-trash"></i></button>
                </div>
            </div>

            <div className="row g-2 align-items-start">
                <div className="col-sm-5">
                    <label className="form-label small mb-1">Link type</label>
                    <select className="form-select form-select-sm" value={k} onChange={(e) => set({ link_kind: e.target.value })}>
                        {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                <div className="col-sm-7">
                    {k === "url" && (
                        <>
                            <label className="form-label small mb-1">URL</label>
                            <input type="text" className="form-control form-control-sm" value={item.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://… or /internal/path" />
                        </>
                    )}
                    {k === "collection" && (
                        <>
                            <label className="form-label small mb-1">Collection slug</label>
                            <input type="text" className="form-control form-control-sm" value={item.collection_slug} onChange={(e) => set({ collection_slug: e.target.value })} placeholder="→ /product?collection=<slug>" />
                        </>
                    )}
                    {k === "cms_page" && (
                        <RelationSelect label="CMS Page" value={item.cms_page} onChange={(v) => set({ cms_page: v })} options={candidates.cmsPages} labelKey="title" placeholder="— select a page —" />
                    )}
                    {k === "page_group" && (
                        <RelationSelect label="Page Group" value={item.page_group} onChange={(v) => set({ page_group: v })} options={candidates.pageGroups} placeholder="— select a page group —" />
                    )}
                    {k === "product_group" && (
                        <RelationSelect label="Product Group" value={item.product_group} onChange={(v) => set({ product_group: v })} options={candidates.productGroups} placeholder="— select a product group —" />
                    )}
                    {k === "mega" && (
                        <>
                            <RelationSelect label="Mega: Category Group" value={item.mega_category_group} onChange={(v) => set({ mega_category_group: v })} options={candidates.categoryGroups} placeholder="— none —" />
                            <RelationSelect label="Mega: Brand Group" value={item.mega_brand_group} onChange={(v) => set({ mega_brand_group: v })} options={candidates.brandGroups} placeholder="— none —" />
                        </>
                    )}
                </div>
            </div>

            <div className="d-flex align-items-center justify-content-between mt-2">
                <div className="form-check mb-0">
                    <input className="form-check-input" type="checkbox" id={`oin-${item.key}`} checked={item.open_in_new} onChange={(e) => set({ open_in_new: e.target.checked })} />
                    <label className="form-check-label small" htmlFor={`oin-${item.key}`}>Open in new tab</label>
                </div>
                {!isChild && onAddSub && (
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onAddSub(item.key)}>
                        <i className="fas fa-plus me-1"></i>Add sub-item
                    </button>
                )}
            </div>
        </div>
    );
}

// Quick-add palette: pick existing CMS content and attach it as a menu item in
// one click (label + link target pre-filled). Keeps menu + items + their
// attachments on a single screen.
const PALETTE_TYPES = [
    { value: "cms_page",       label: "Pages",            listKey: "cmsPages",       labelKey: "title", kind: "cms_page",      rel: "cms_page" },
    { value: "page_group",     label: "Page Groups",      listKey: "pageGroups",     labelKey: "name",  kind: "page_group",    rel: "page_group" },
    { value: "product_group",  label: "Product Groups",   listKey: "productGroups",  labelKey: "name",  kind: "product_group", rel: "product_group" },
    { value: "mega_category",  label: "Categories (mega panel)", listKey: "categoryGroups", labelKey: "name", kind: "mega", rel: "mega_category_group" },
    { value: "mega_brand",     label: "Brands (mega panel)",     listKey: "brandGroups",    labelKey: "name", kind: "mega", rel: "mega_brand_group" },
];

function ContentPalette({ candidates, attachedRefs, onAdd, onAddCustom }) {
    const [type, setType] = useState("cms_page");
    const [q, setQ] = useState("");
    const cfg = PALETTE_TYPES.find((t) => t.value === type);
    const list = candidates[cfg.listKey] || [];
    const filtered = q.trim()
        ? list.filter((e) => (e[cfg.labelKey] || "").toLowerCase().includes(q.trim().toLowerCase()))
        : list;
    const attached = attachedRefs[cfg.rel] || new Set();

    return (
        <div className="card mb-3">
            <div className="card-header"><i className="fas fa-wand-magic-sparkles me-2"></i>Add content</div>
            <div className="card-body">
                <p className="text-muted small mb-2">Click <i className="fas fa-plus"></i> to attach existing content as a menu item — label and link are filled in for you.</p>
                <select className="form-select form-select-sm mb-2" value={type} onChange={(e) => { setType(e.target.value); setQ(""); }}>
                    {PALETTE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input className="form-control form-control-sm mb-2" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {filtered.length === 0 ? (
                        <p className="text-muted small mb-0">Nothing to add.</p>
                    ) : (
                        filtered.map((e) => {
                            const isAttached = attached.has(e.documentId);
                            return (
                                <div key={e.documentId} className="d-flex align-items-center justify-content-between border-bottom py-1">
                                    <span className="small text-truncate me-2">
                                        {e[cfg.labelKey]}
                                        {e.page_type && <span className="badge bg-light text-dark ms-1">{e.page_type}</span>}
                                        {isAttached && <span className="badge bg-success ms-1">added</span>}
                                    </span>
                                    <button type="button" className="btn btn-sm btn-outline-primary flex-shrink-0" title="Add to menu"
                                        onClick={() => onAdd(cfg.kind, e[cfg.labelKey], { [cfg.rel]: e.documentId })}>
                                        <i className="fas fa-plus"></i>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
                <hr className="my-2" />
                <button type="button" className="btn btn-sm btn-outline-secondary w-100" onClick={onAddCustom}>
                    <i className="fas fa-link me-1"></i>Add custom URL link
                </button>
            </div>
        </div>
    );
}

export default function CmsMenuDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [menu, setMenu] = useState(null);
    const [isPublished, setIsPublished] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();
    const isNew = !documentId || documentId === "new";

    const [name, setName] = useState("");
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [position, setPosition] = useState("top");
    const [enabled, setEnabled] = useState(true);
    const [selectedPageIds, setSelectedPageIds] = useState([]); // pages this menu is assigned to

    const [items, setItems] = useState([]);
    const originalIdsRef = useRef(new Set());   // item documentIds loaded from server
    const tempRef = useRef(1);                  // counter for new-item keys

    const [candidates, setCandidates] = useState({
        cmsPages: [], pageGroups: [], productGroups: [], categoryGroups: [], brandGroups: [],
    });

    const mapServerItem = (it) => ({
        key: it.documentId,
        documentId: it.documentId,
        parentKey: it.parent?.documentId || null,
        order: it.order ?? 0,
        label: it.label || "",
        link_kind: it.link_kind || "url",
        url: it.url || "",
        collection_slug: it.collection_slug || "",
        cms_page: it.cms_page?.documentId || "",
        page_group: it.page_group?.documentId || "",
        product_group: it.product_group?.documentId || "",
        mega_category_group: it.mega_category_group?.documentId || "",
        mega_brand_group: it.mega_brand_group?.documentId || "",
        open_in_new: !!it.open_in_new,
    });

    const reloadItems = useCallback(async (menuDocId) => {
        if (!jwt || !menuDocId) return;
        try {
            const res = await CmsMenuItemsEndpoints.listDraft({
                filters: { menu: { documentId: { $eq: menuDocId } } },
                sort: ["order:asc"],
                pageSize: 500,
            });
            const mapped = (res?.data || []).map(mapServerItem);
            originalIdsRef.current = new Set(mapped.map((m) => m.documentId));
            setItems(renumber(mapped));
        } catch (err) {
            console.error("Failed to load menu items", err);
        }
    }, [jwt]);

    useEffect(() => {
        if (!jwt) return;
        const opts = { sort: ["name:asc"], pageSize: 500 };
        CmsPagesEndpoints.listDraft({ sort: ["title:asc"] }).then((r) => setCandidates((c) => ({ ...c, cmsPages: r?.data || [] }))).catch(() => {});
        CmsPageGroupsEndpoints.listDraft(opts).then((r) => setCandidates((c) => ({ ...c, pageGroups: r?.data || [] }))).catch(() => {});
        ProductGroupsEndpoints.listDraft(opts).then((r) => setCandidates((c) => ({ ...c, productGroups: r?.data || [] }))).catch(() => {});
        CategoryGroupsEndpoints.listDraft(opts).then((r) => setCandidates((c) => ({ ...c, categoryGroups: r?.data || [] }))).catch(() => {});
        BrandGroupsEndpoints.listDraft(opts).then((r) => setCandidates((c) => ({ ...c, brandGroups: r?.data || [] }))).catch(() => {});
    }, [jwt]);

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        Promise.all([
            CmsMenusEndpoints.byIdDraft(documentId, {
                fields: ["name", "title", "slug", "position", "enabled"],
                populate: { pages: { fields: ["title", "slug", "page_type"] } },
            }),
            CmsMenusEndpoints.byIdPublished(documentId, { fields: ["documentId"] }).catch(() => ({ data: null })),
        ])
            .then(([draftRes, pubRes]) => {
                const m = draftRes.data || draftRes;
                setMenu(m);
                setIsPublished(!!(pubRes.data));
                setName(m.name || "");
                setTitle(m.title || "");
                setSlug(m.slug || "");
                setPosition(m.position || "top");
                setEnabled(m.enabled !== false);
                setSelectedPageIds((m.pages || []).map((p) => p.documentId));
            })
            .catch((err) => console.error("Failed to load menu", err))
            .finally(() => setLoading(false));
        reloadItems(documentId);
    }, [jwt, documentId, isNew, reloadItems]);

    // ---- local item-tree editing ----
    const setItemField = (key, patch) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

    const addItem = (parentKey = null) => {
        setItems((prev) => {
            const groupMax = prev.filter((i) => i.parentKey === parentKey).reduce((m, i) => Math.max(m, i.order ?? 0), -1);
            return [...prev, blankItem(`tmp-${tempRef.current++}`, parentKey, groupMax + 1)];
        });
    };

    // Quick-add from the content palette: a pre-filled top-level item.
    const addAttached = (link_kind, label, extra) => {
        setItems((prev) => {
            const groupMax = prev.filter((i) => !i.parentKey).reduce((m, i) => Math.max(m, i.order ?? 0), -1);
            const base = blankItem(`tmp-${tempRef.current++}`, null, groupMax + 1);
            return [...prev, { ...base, link_kind, label: label || "", ...extra }];
        });
    };

    const removeItem = (key) => setItems((prev) => prev.filter((i) => i.key !== key && i.parentKey !== key));

    const moveItem = (key, dir) => {
        setItems((prev) => {
            const it = prev.find((i) => i.key === key);
            if (!it) return prev;
            const group = prev.filter((i) => i.parentKey === it.parentKey).sort((a, b) => a.order - b.order);
            const idx = group.findIndex((i) => i.key === key);
            const swapIdx = dir === "up" ? idx - 1 : idx + 1;
            if (swapIdx < 0 || swapIdx >= group.length) return prev;
            const a = group[idx], b = group[swapIdx];
            return prev.map((i) => {
                if (i.key === a.key) return { ...i, order: b.order };
                if (i.key === b.key) return { ...i, order: a.order };
                return i;
            });
        });
    };

    // Persist every item: delete removed, create new, update existing. Parents
    // (top-level) first so children can resolve a real documentId.
    const persistItems = async (menuDocId, { publish }) => {
        const normalized = renumber(items);
        const liveIds = new Set(normalized.filter((i) => i.documentId).map((i) => i.documentId));
        for (const id of [...originalIdsRef.current].filter((id) => !liveIds.has(id))) {
            try { await CmsMenuItemsEndpoints.del(id); } catch (e) { console.error("delete item failed", e); }
        }
        const keyToDoc = {};
        const persistOne = async (it, parentDocId) => {
            const payload = buildItemPayload(it, menuDocId, parentDocId);
            if (it.documentId) {
                await CmsMenuItemsEndpoints.updateDraft(it.documentId, payload);
                keyToDoc[it.key] = it.documentId;
            } else {
                const res = await CmsMenuItemsEndpoints.create(payload);
                keyToDoc[it.key] = (res.data || res).documentId;
            }
        };
        for (const it of normalized.filter((i) => !i.parentKey).sort((a, b) => a.order - b.order)) await persistOne(it, null);
        for (const it of normalized.filter((i) => i.parentKey).sort((a, b) => a.order - b.order)) await persistOne(it, keyToDoc[it.parentKey] || null);
        if (publish) {
            for (const docId of Object.values(keyToDoc)) {
                try { await CmsMenuItemsEndpoints.publish(docId); } catch (e) { console.error("publish item failed", e); }
            }
        }
    };

    const menuPayload = () => ({ name, title, position, enabled, pages: toOrderedRelation(selectedPageIds) });

    const togglePage = (docId) => {
        setSelectedPageIds((prev) => (prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (isNew) {
                const data = { ...menuPayload(), slug: slug || name.toLowerCase().replace(/\s+/g, "-") };
                const res = await CmsMenusEndpoints.create(data);
                const created = res.data || res;
                router.push(`/${created.documentId}/cms-menu`);
                return;
            }
            await CmsMenusEndpoints.updateDraft(documentId, menuPayload());
            await persistItems(documentId, { publish: false });
            await reloadItems(documentId);
            toast("Menu saved!", "success");
        } catch (err) {
            console.error("Failed to save menu", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        setSaving(true);
        try {
            await CmsMenusEndpoints.updateDraft(documentId, menuPayload());
            await persistItems(documentId, { publish: true });
            await CmsMenusEndpoints.publish(documentId);
            setIsPublished(true);
            await reloadItems(documentId);
            toast("Menu & items published!", "success");
        } catch (err) {
            console.error("Failed to publish menu", err);
            toast("Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setSaving(true);
        try {
            await CmsMenusEndpoints.unpublish(documentId);
            setIsPublished(false);
            toast("Menu unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish menu", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Delete this menu and all its items?")) return;
        try {
            for (const id of originalIdsRef.current) { try { await CmsMenuItemsEndpoints.del(id); } catch (e) { console.error(e); } }
            await CmsMenusEndpoints.del(documentId);
            router.push("/cms-menus");
        } catch (err) {
            console.error("Failed to delete menu", err);
            toast("Failed to delete.", "danger");
        }
    };

    const topLevel = items.filter((i) => !i.parentKey).sort((a, b) => a.order - b.order);
    const childrenOf = (key) => items.filter((i) => i.parentKey === key).sort((a, b) => a.order - b.order);

    // documentIds already attached per relation — lets the palette flag "added".
    const refSet = (field) => new Set(items.filter((i) => i[field]).map((i) => i[field]));
    const attachedRefs = {
        cms_page: refSet("cms_page"),
        page_group: refSet("page_group"),
        product_group: refSet("product_group"),
        mega_category_group: refSet("mega_category_group"),
        mega_brand_group: refSet("mega_brand_group"),
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/cms-menus">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Menu" : "Edit Menu"}</h2>
                    {!isNew && isPublished && <span className="badge bg-success ms-2 align-self-center">Published</span>}
                    {!isNew && menu && !isPublished && <span className="badge bg-secondary ms-2 align-self-center">Draft</span>}
                    <div className="ms-auto d-flex gap-2">
                        {!isNew && (
                            <button className="btn btn-sm btn-outline-danger" onClick={handleDelete}>
                                <i className="fas fa-trash me-1"></i>Delete
                            </button>
                        )}
                        {!isNew && isPublished && (
                            <button className="btn btn-sm btn-outline-secondary" onClick={handleUnpublish} disabled={saving}>
                                <i className="fas fa-eye-slash me-1"></i>Unpublish
                            </button>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving…" : isNew ? "Create Menu" : "Save Draft"}
                        </button>
                        {!isNew && (
                            <button className="btn btn-sm btn-success" onClick={handlePublish} disabled={saving}>
                                <i className="fas fa-upload me-1"></i>{saving ? "Publishing…" : "Save & Publish"}
                            </button>
                        )}
                    </div>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !isNew && !menu && (
                    <div className="alert alert-warning">Menu not found.</div>
                )}

                {!loading && (isNew || menu) && (
                    <div className="row">
                        <div className="col-md-7">
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-list-ul me-2"></i>Menu Items {!isNew && <span className="badge bg-primary ms-1">{items.length}</span>}</div>
                                <div className="card-body">
                                    {isNew ? (
                                        <p className="text-muted small mb-0">Create the menu first, then build its items here.</p>
                                    ) : (
                                        <>
                                            {topLevel.length === 0 && (
                                                <p className="text-muted small">No items yet — add your first one below.</p>
                                            )}
                                            {topLevel.map((it, idx) => {
                                                const kids = childrenOf(it.key);
                                                return (
                                                    <div key={it.key} className="mb-2">
                                                        <ItemEditorCard
                                                            item={it}
                                                            candidates={candidates}
                                                            isChild={false}
                                                            canUp={idx > 0}
                                                            canDown={idx < topLevel.length - 1}
                                                            onChange={setItemField}
                                                            onMove={moveItem}
                                                            onRemove={removeItem}
                                                            onAddSub={addItem}
                                                        />
                                                        {kids.length > 0 && (
                                                            <div className="ps-4">
                                                                {kids.map((c, cidx) => (
                                                                    <ItemEditorCard
                                                                        key={c.key}
                                                                        item={c}
                                                                        candidates={candidates}
                                                                        isChild
                                                                        canUp={cidx > 0}
                                                                        canDown={cidx < kids.length - 1}
                                                                        onChange={setItemField}
                                                                        onMove={moveItem}
                                                                        onRemove={removeItem}
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            <button type="button" className="btn btn-sm btn-success mt-1" onClick={() => addItem(null)}>
                                                <i className="fas fa-plus me-1"></i>Add Item
                                            </button>
                                            <p className="text-muted small mt-2 mb-0">Changes (incl. new/removed items) save when you click <strong>Save Draft</strong> or <strong>Save &amp; Publish</strong>.</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="col-md-5">
                            <div className="card mb-3">
                                <div className="card-header">Menu</div>
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Name</label>
                                        <input type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Navigation" />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Title <span className="text-muted small">(optional)</span></label>
                                        <input type="text" className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Heading shown on the side drawer" />
                                    </div>
                                    {isNew && (
                                        <div className="mb-3">
                                            <label className="form-label">Slug</label>
                                            <input type="text" className="form-control" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto-generated from name" />
                                        </div>
                                    )}
                                    <div className="mb-3">
                                        <label className="form-label">Position</label>
                                        <select className="form-select" value={position} onChange={(e) => setPosition(e.target.value)}>
                                            {POSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                        <small className="text-muted">Where the storefront renders this menu.</small>
                                    </div>
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="menuEnabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                                        <label className="form-check-label" htmlFor="menuEnabled">Enabled</label>
                                    </div>
                                    {!isNew && menu?.slug && (
                                        <div className="mt-3">
                                            <label className="form-label mb-0">Slug</label>
                                            <code className="d-block">{menu.slug}</code>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {!isNew && (
                                <ContentPalette
                                    candidates={candidates}
                                    attachedRefs={attachedRefs}
                                    onAdd={addAttached}
                                    onAddCustom={() => addItem(null)}
                                />
                            )}

                            {!isNew && (
                                <PagePickerTabs
                                    allPages={candidates.cmsPages}
                                    selectedPageIds={selectedPageIds}
                                    onToggle={togglePage}
                                    onReorder={setSelectedPageIds}
                                    onRemoveAll={() => setSelectedPageIds([])}
                                    title="Assigned to pages"
                                    icon="fas fa-file-lines"
                                    description="Pages that use this menu instead of the site-wide default. Leave empty to make this the global default for its position."
                                />
                            )}
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
