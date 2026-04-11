import { useState } from "react";
import { authApi } from "../lib/api";

/**
 * BulkProductActions — reusable toolbar for bulk product operations.
 *
 * Renders a selection badge, publish/unpublish buttons, and
 * assign-relation dropdowns (categories, brands, suppliers).
 *
 * Props:
 *   selectedIds       – Set<string> of selected product documentIds
 *   categories        – Array of category lookup objects ({ documentId, name })
 *   brands            – Array of brand lookup objects
 *   suppliers         – Array of supplier lookup objects
 *   onAssigned        – (field, documentIds, updatedDocIds) => void
 *                       Called after each successful relation assignment so the
 *                       parent can update its local product state.
 *   onPublished       – (docId) => void  — called per product after publish
 *   onUnpublished     – (docId) => void  — called per product after unpublish
 *   onComplete        – () => void       — called when a bulk operation finishes
 *   toast             – (message, variant) => void
 *   showPublish       – boolean (default true)  — whether to show publish/unpublish buttons
 */
export default function BulkProductActions({
    selectedIds,
    categories = [],
    brands = [],
    suppliers = [],
    onAssigned,
    onPublished,
    onUnpublished,
    onComplete,
    toast,
    showPublish = true,
}) {
    const [bulkUpdating, setBulkUpdating] = useState(false);

    if (!selectedIds || selectedIds.size === 0) return null;

    // ── Bulk assign relation ─────────────────────────────────
    const bulkAssignRelation = async (field, documentIds) => {
        const ids = [...selectedIds];
        const label = field;
        if (!confirm(`Assign selected ${label} to ${ids.length} product(s)?`)) return;

        setBulkUpdating(true);
        let ok = 0, fail = 0;
        for (const docId of ids) {
            try {
                await authApi.put(`/products/${docId}?status=draft`, {
                    data: { [field]: documentIds },
                });
                ok++;
                if (onAssigned) onAssigned(field, documentIds, docId);
            } catch (err) {
                fail++;
                console.error(`Failed to update ${label} for`, docId, err);
            }
        }
        toast(`Updated ${label} on ${ok} product(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setBulkUpdating(false);
        if (onComplete) onComplete();
    };

    // ── Bulk publish ─────────────────────────────────────────
    const bulkPublish = async (includeVariants) => {
        const ids = [...selectedIds];
        if (!confirm(`Publish ${ids.length} product(s)${includeVariants ? " including their variants" : ""}?`)) return;

        setBulkUpdating(true);
        const allIds = [...ids];
        if (includeVariants) {
            for (const docId of ids) {
                try {
                    const res = await authApi.get("/products", {
                        status: "draft",
                        filters: { parent: { documentId: docId } },
                        fields: ["documentId"],
                        pagination: { pageSize: 200 },
                    });
                    (res.data || []).forEach(v => { if (!allIds.includes(v.documentId)) allIds.push(v.documentId); });
                } catch (err) {
                    console.error("Failed to fetch variants for", docId, err);
                }
            }
        }

        let ok = 0, fail = 0;
        for (const docId of allIds) {
            try {
                await authApi.post(`/products/${docId}/publish`, {});
                ok++;
                if (onPublished) onPublished(docId);
            } catch (err) {
                fail++;
                console.error("Failed to publish", docId, err);
            }
        }
        toast(`Published ${ok} product(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setBulkUpdating(false);
        if (onComplete) onComplete();
    };

    // ── Bulk unpublish ───────────────────────────────────────
    const bulkUnpublish = async () => {
        const ids = [...selectedIds];
        if (!confirm(`Unpublish ${ids.length} product(s)?`)) return;

        setBulkUpdating(true);
        let ok = 0, fail = 0;
        for (const docId of ids) {
            try {
                await authApi.post(`/products/${docId}/unpublish`, {});
                ok++;
                if (onUnpublished) onUnpublished(docId);
            } catch (err) {
                fail++;
                console.error("Failed to unpublish", docId, err);
            }
        }
        toast(`Unpublished ${ok} product(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setBulkUpdating(false);
        if (onComplete) onComplete();
    };

    return (
        <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="badge bg-primary">{selectedIds.size} selected</span>

            {showPublish && (
                <>
                    <button className="btn btn-sm btn-success" onClick={() => bulkPublish(false)} disabled={bulkUpdating}>
                        <i className="fas fa-upload me-1"></i>Publish
                    </button>
                    <button className="btn btn-sm btn-outline-success" onClick={() => bulkPublish(true)} disabled={bulkUpdating}>
                        <i className="fas fa-upload me-1"></i>Publish + Variants
                    </button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={bulkUnpublish} disabled={bulkUpdating}>
                        <i className="fas fa-eye-slash me-1"></i>Unpublish
                    </button>
                    <span className="border-start ps-2"></span>
                </>
            )}

            <select
                className="form-select form-select-sm"
                style={{ width: 160 }}
                disabled={bulkUpdating}
                defaultValue=""
                onChange={(e) => {
                    if (!e.target.value) return;
                    bulkAssignRelation("categories", [e.target.value]);
                    e.target.value = "";
                }}
            >
                <option value="">Assign Category…</option>
                {categories.map(c => (
                    <option key={c.documentId} value={c.documentId}>{c.name}</option>
                ))}
            </select>
            <select
                className="form-select form-select-sm"
                style={{ width: 160 }}
                disabled={bulkUpdating}
                defaultValue=""
                onChange={(e) => {
                    if (!e.target.value) return;
                    bulkAssignRelation("brands", [e.target.value]);
                    e.target.value = "";
                }}
            >
                <option value="">Assign Brand…</option>
                {brands.map(b => (
                    <option key={b.documentId} value={b.documentId}>{b.name}</option>
                ))}
            </select>
            <select
                className="form-select form-select-sm"
                style={{ width: 160 }}
                disabled={bulkUpdating}
                defaultValue=""
                onChange={(e) => {
                    if (!e.target.value) return;
                    bulkAssignRelation("suppliers", [e.target.value]);
                    e.target.value = "";
                }}
            >
                <option value="">Assign Supplier…</option>
                {suppliers.map(s => (
                    <option key={s.documentId} value={s.documentId}>{s.name}</option>
                ))}
            </select>

            {bulkUpdating && <i className="fas fa-spinner fa-spin text-muted"></i>}
        </div>
    );
}
