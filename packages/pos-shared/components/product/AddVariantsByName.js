// Free-text variant creation, shared by pos-stock (product-variants page) and
// rutba-cms (product Variants tab via ProductGalleryManager).
//
// The term-type / gallery-image creation flows require a predefined term or an
// image selection. This surface lets a user just type one or more variant names
// (one per line, or comma-separated) and create them in one go. Each variant
// inherits the parent's price + active status; sku/barcode are left blank so the
// user can fill them in the variants table afterwards (avoids duplicate barcodes).

import { useState } from "react";
import { createVariant } from "../../lib/variants";

function getEntryId(entry) {
    return entry?.documentId || entry?.id;
}

// Split on newlines/commas, trim, drop blanks, de-dupe (case-insensitive).
function parseNames(raw) {
    const seen = new Set();
    const out = [];
    for (const part of (raw || "").split(/[\n,]/)) {
        const name = part.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

export default function AddVariantsByName({ product, onCreated, onError, onSuccess }) {
    const [names, setNames] = useState("");
    const [busy, setBusy] = useState(false);

    async function handleCreate() {
        const parentDocId = getEntryId(product);
        if (!parentDocId) return onError && onError("Missing product");
        const list = parseNames(names);
        if (list.length === 0) return onError && onError("Enter at least one variant name");

        setBusy(true);
        let created = 0;
        try {
            for (const name of list) {
                await createVariant(parentDocId, "name", {
                    name,
                    selling_price: product?.selling_price,
                    offer_price: product?.offer_price,
                    is_active: product?.is_active ?? true,
                });
                created++;
            }
            setNames("");
            if (onSuccess) onSuccess(`Created ${created} variant(s)`);
            if (onCreated) onCreated();
        } catch (err) {
            console.error("Add variants by name failed", err);
            if (onError) onError(`Failed after creating ${created} variant(s)`);
        } finally {
            setBusy(false);
        }
    }

    const count = parseNames(names).length;

    return (
        <div className="card mb-3">
            <div className="card-header py-2">
                <h6 className="mb-0"><i className="fas fa-i-cursor me-2" />Add Variants by Name</h6>
            </div>
            <div className="card-body">
                <label className="form-label small fw-bold mb-1">Variant names</label>
                <textarea
                    className="form-control form-control-sm mb-2"
                    rows={3}
                    value={names}
                    onChange={(e) => setNames(e.target.value)}
                    placeholder={"One name per line, or comma-separated\ne.g.\nRed - Large\nBlue - Small"}
                    disabled={busy}
                />
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <span className="text-muted small">
                        {count > 0
                            ? `${count} name(s) ready — each becomes a variant inheriting price & active status.`
                            : "Each line becomes a new variant, inheriting the parent's price & active status."}
                    </span>
                    <button
                        className="btn btn-success btn-sm"
                        type="button"
                        disabled={busy || count === 0}
                        onClick={handleCreate}
                    >
                        <i className="fas fa-plus me-1" />
                        {busy ? "Creating…" : `Create ${count || ""} Variant(s)`}
                    </button>
                </div>
            </div>
        </div>
    );
}
