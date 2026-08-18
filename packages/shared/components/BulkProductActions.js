import { useState } from "react";
import { ProductsEndpoints } from "@rutba/api-provider/endpoints";

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
                await ProductsEndpoints.update(docId, {
                    [field]: documentIds,
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
                    const res = await ProductsEndpoints.byParentDraft(docId, { pageSize: 200 });
                    (res.data || []).forEach(v => { if (!allIds.includes(v.documentId)) allIds.push(v.documentId); });
                } catch (err) {
                    console.error("Failed to fetch variants for", docId, err);
                }
            }
        }

        let ok = 0;
        const reasons = [];
        for (const docId of allIds) {
            try {
                await ProductsEndpoints.publish(docId);
                ok++;
                if (onPublished) onPublished(docId);
            } catch (err) {
                reasons.push(err?.response?.data?.error?.message || err?.message || "Unknown error");
                console.error("Failed to publish", docId, err);
            }
        }
        if (reasons.length === 0) {
            toast(`Published ${ok} product(s).`, "success");
        } else {
            // A bare "30 failed" hides the one thing the operator needs to know.
            // Most bulk failures share a cause (typically the image gate), so
            // report the commonest reason with its count instead of a number.
            const byReason = reasons.reduce((m, r) => m.set(r, (m.get(r) || 0) + 1), new Map());
            const [reason, n] = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0];
            const others = reasons.length - n;
            toast(
                `Published ${ok} product(s). ${reasons.length} refused — ${n}: ${reason}` +
                    (others ? ` (+${others} for other reasons — see the console)` : ""),
                "warning"
            );
        }
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
                await ProductsEndpoints.unpublish(docId);
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
