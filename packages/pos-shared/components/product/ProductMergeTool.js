// Shared product-merge tool, mounted by both pos-stock (in /product-relations)
// and rutba-cms (as a Merge tab on the product page).
//
// Two operations:
//
//   1. Merge other products INTO this one. User searches, ticks results,
//      and confirms — stock items, purchase items, terms/categories/brands,
//      and child variants transfer onto the current product. Source rows
//      are optionally deleted.
//
//   2. Merge this product's variants BACK INTO ITSELF (inverse). User ticks
//      variants from the table; their stock items + purchase items + terms
//      move onto the parent and the variant rows are deleted. Useful when
//      a variant was created in error or is no longer needed.
//
// Both operations share the "Merge Options" checkboxes on the left (what
// to transfer + whether to delete sources). The component owns its own
// state — callers pass `product`, `documentId`, and an `onChange` hook
// to re-fetch the product after the merge succeeds.

import { useState, useEffect } from "react";
import {
    StockItemsEndpoints,
    PurchaseItemsEndpoints,
    ProductsEndpoints,
} from "@rutba/api-provider/endpoints";

function getEntryId(entry) {
    return entry?.documentId || entry?.id;
}

export default function ProductMergeTool({ product, documentId, currency = "", onChange }) {
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Search-based merge (source = other products)
    const [mergeSearch, setMergeSearch] = useState("");
    const [mergeResults, setMergeResults] = useState([]);
    const [mergeSearchLoading, setMergeSearchLoading] = useState(false);
    const [mergeSelection, setMergeSelection] = useState(new Set());
    const [merging, setMerging] = useState(false);
    const [mergeLog, setMergeLog] = useState([]);

    // Variants of this product (source = own variants)
    const [variants, setVariants] = useState([]);
    const [variantSelection, setVariantSelection] = useState(new Set());
    const [mergingVariants, setMergingVariants] = useState(false);

    // What transfers + whether to delete sources
    const [transferItems, setTransferItems] = useState(true);
    const [transferPurchaseItems, setTransferPurchaseItems] = useState(true);
    const [transferRelations, setTransferRelations] = useState(true);
    const [deleteSource, setDeleteSource] = useState(false);

    // Load this product's variants so the inverse merge has something to list.
    useEffect(() => {
        if (!documentId || documentId === "new") return;
        let cancelled = false;
        ProductsEndpoints.byParent(documentId, {
            pageSize: 100,
            populate: { categories: true, brands: true, suppliers: true, terms: true, logo: true },
        }).then(res => {
            if (cancelled) return;
            setVariants(res?.data ?? res ?? []);
        }).catch(err => {
            if (cancelled) return;
            console.error("Failed to load variants", err);
        });
        return () => { cancelled = true; };
    }, [documentId]);

    // Debounced search
    useEffect(() => {
        const searchValue = mergeSearch.trim();
        if (!searchValue || searchValue.length < 2) {
            setMergeResults([]);
            return;
        }
        let isActive = true;
        const timer = setTimeout(async () => {
            setMergeSearchLoading(true);
            try {
                const res = await ProductsEndpoints.search(searchValue, 1, 20);
                const data = res?.data ?? res;
                const filtered = (data || []).filter(p => getEntryId(p) !== documentId);
                if (isActive) setMergeResults(filtered);
            } catch (err) {
                console.error("Merge search failed", err);
                if (isActive) setMergeResults([]);
            } finally {
                if (isActive) setMergeSearchLoading(false);
            }
        }, 300);
        return () => { isActive = false; clearTimeout(timer); };
    }, [mergeSearch, documentId]);

    function toggleMergeSelection(docId) {
        setMergeSelection(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId);
            else next.add(docId);
            return next;
        });
    }

    function toggleVariantSelection(docId) {
        setVariantSelection(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId);
            else next.add(docId);
            return next;
        });
    }

    // Shared transfer pipeline. `sourceDocId` is consumed; `targetDocId`
    // receives everything. Caller decides whether to delete the source.
    async function runTransfer(sourceDocId, sourceProduct, log) {
        if (transferItems) {
            let page = 1;
            let totalPages = 1;
            let count = 0;
            do {
                const res = await StockItemsEndpoints.byProduct(sourceDocId, { page, pageSize: 100 });
                const items = res?.data ?? res ?? [];
                totalPages = res?.meta?.pagination?.pageCount || 1;
                for (const item of items) {
                    await StockItemsEndpoints.update(getEntryId(item), {
                        product: { connect: [documentId], disconnect: [sourceDocId] },
                    });
                    count++;
                }
                page++;
            } while (page <= totalPages);
            log.push(`  Transferred ${count} stock item(s)`);
        }
        if (transferPurchaseItems) {
            let page = 1;
            let totalPages = 1;
            let count = 0;
            do {
                const res = await PurchaseItemsEndpoints.byProduct(sourceDocId, { page, pageSize: 100 });
                const items = res?.data ?? res ?? [];
                totalPages = res?.meta?.pagination?.pageCount || 1;
                for (const item of items) {
                    await PurchaseItemsEndpoints.update(getEntryId(item), {
                        product: { connect: [documentId], disconnect: [sourceDocId] },
                    });
                    count++;
                }
                page++;
            } while (page <= totalPages);
            log.push(`  Transferred ${count} purchase item(s)`);
        }
        if (transferRelations && sourceProduct) {
            const ids = (rel) => (sourceProduct[rel] || []).map(getEntryId).filter(Boolean);
            const relPayload = {};
            const cats = ids("categories");
            const brs = ids("brands");
            const sups = ids("suppliers");
            const trms = ids("terms");
            if (cats.length) relPayload.categories = { connect: cats };
            if (brs.length) relPayload.brands = { connect: brs };
            if (sups.length) relPayload.suppliers = { connect: sups };
            if (trms.length) relPayload.terms = { connect: trms };
            if (Object.keys(relPayload).length > 0) {
                await ProductsEndpoints.update(documentId, relPayload);
                log.push(`  Copied relations: ${Object.keys(relPayload).join(", ")}`);
            }
        }
    }

    async function handleMerge() {
        if (mergeSelection.size === 0) return alert("Select at least one product to merge");
        const sourceNames = mergeResults
            .filter(p => mergeSelection.has(getEntryId(p)))
            .map(p => p.name || p.sku || getEntryId(p))
            .join(", ");
        if (!confirm(`Merge ${mergeSelection.size} product(s) (${sourceNames}) into "${product?.name}"?\n\nThis will transfer stock items, purchase items, and relations to this product.`)) return;

        setMerging(true);
        setError("");
        setSuccess("");
        const log = [];
        try {
            for (const sourceDocId of mergeSelection) {
                const sourceProduct = mergeResults.find(p => getEntryId(p) === sourceDocId);
                const sourceName = sourceProduct?.name || sourceDocId;
                log.push(`--- Merging "${sourceName}" ---`);
                await runTransfer(sourceDocId, sourceProduct, log);

                // Re-parent source's child variants onto this product.
                const variantsRes = await ProductsEndpoints.byParent(sourceDocId);
                const childVariants = variantsRes?.data ?? variantsRes ?? [];
                if (childVariants.length > 0) {
                    for (const v of childVariants) {
                        await ProductsEndpoints.update(getEntryId(v), {
                            parent: { connect: [documentId], disconnect: [sourceDocId] },
                        });
                    }
                    log.push(`  Re-parented ${childVariants.length} variant(s)`);
                }

                if (deleteSource) {
                    await ProductsEndpoints.del(sourceDocId);
                    log.push(`  Deleted source "${sourceName}"`);
                } else {
                    log.push(`  Source "${sourceName}" kept`);
                }
            }
            setMergeLog(log);
            setMergeSelection(new Set());
            setMergeSearch("");
            setMergeResults([]);
            setSuccess(`Merged ${mergeSelection.size} product(s) into "${product?.name}".`);
            if (onChange) onChange();
        } catch (err) {
            console.error("Merge failed", err);
            setError("Merge failed: " + (err.message || "Unknown error"));
            setMergeLog(log);
        } finally {
            setMerging(false);
        }
    }

    async function handleMergeVariants() {
        if (variantSelection.size === 0) return alert("Select at least one variant to merge");
        const sourceNames = variants
            .filter(v => variantSelection.has(getEntryId(v)))
            .map(v => v.name || v.sku || getEntryId(v))
            .join(", ");
        if (!confirm(`Merge ${variantSelection.size} variant(s) (${sourceNames}) back into parent "${product?.name}"?\n\nStock items, purchase items, and terms move to the parent; variant rows are deleted.`)) return;

        setMergingVariants(true);
        setError("");
        setSuccess("");
        const log = [];
        try {
            for (const sourceDocId of variantSelection) {
                const sourceVariant = variants.find(v => getEntryId(v) === sourceDocId);
                const sourceName = sourceVariant?.name || sourceDocId;
                log.push(`--- Merging variant "${sourceName}" into parent ---`);
                await runTransfer(sourceDocId, sourceVariant, log);
                // A variant collapsed back into its parent has no remaining
                // meaning; always delete the variant row.
                await ProductsEndpoints.del(sourceDocId);
                log.push(`  Deleted variant "${sourceName}"`);
            }
            setMergeLog(log);
            setVariantSelection(new Set());
            setSuccess(`Merged ${variantSelection.size} variant(s) back into "${product?.name}".`);
            if (onChange) onChange();
            // Reload variants list locally too
            const res = await ProductsEndpoints.byParent(documentId, {
                pageSize: 100,
                populate: { categories: true, brands: true, suppliers: true, terms: true },
            });
            setVariants(res?.data ?? res ?? []);
        } catch (err) {
            console.error("Variant merge failed", err);
            setError("Variant merge failed: " + (err.message || "Unknown error"));
            setMergeLog(log);
        } finally {
            setMergingVariants(false);
        }
    }

    return (
        <div>
            {error && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                    {error}
                    <button type="button" className="btn-close" onClick={() => setError("")} />
                </div>
            )}
            {success && (
                <div className="alert alert-success alert-dismissible fade show" role="alert">
                    {success}
                    <button type="button" className="btn-close" onClick={() => setSuccess("")} />
                </div>
            )}

            <div className="row">
                {/* Left column: merge options shared by both modes */}
                <div className="col-lg-4">
                    <div className="card mb-3">
                        <div className="card-body">
                            <h5 className="card-title">Merge Options</h5>
                            <p className="text-muted small mb-3">
                                These apply to both flows below: merging other products into this one,
                                and merging this product's variants back into the parent.
                            </p>
                            <div className="form-check mb-2">
                                <input className="form-check-input" type="checkbox" id="pmt-opt-items" checked={transferItems} onChange={e => setTransferItems(e.target.checked)} />
                                <label className="form-check-label" htmlFor="pmt-opt-items">Transfer stock items</label>
                            </div>
                            <div className="form-check mb-2">
                                <input className="form-check-input" type="checkbox" id="pmt-opt-purchase" checked={transferPurchaseItems} onChange={e => setTransferPurchaseItems(e.target.checked)} />
                                <label className="form-check-label" htmlFor="pmt-opt-purchase">Transfer purchase items</label>
                            </div>
                            <div className="form-check mb-2">
                                <input className="form-check-input" type="checkbox" id="pmt-opt-relations" checked={transferRelations} onChange={e => setTransferRelations(e.target.checked)} />
                                <label className="form-check-label" htmlFor="pmt-opt-relations">Copy categories, brands, suppliers, terms</label>
                            </div>
                            <div className="form-check mb-2">
                                <input className="form-check-input" type="checkbox" id="pmt-opt-delete" checked={deleteSource} onChange={e => setDeleteSource(e.target.checked)} />
                                <label className="form-check-label text-danger" htmlFor="pmt-opt-delete">
                                    Delete source product(s) after merge
                                    <div className="form-text small">Only applies to the search-based merge. Variant merges always delete the variant row.</div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right column: the two merge actions */}
                <div className="col-lg-8">
                    {/* Inverse merge — variants back into parent */}
                    {variants.length > 0 && (
                        <div className="card mb-3 border-warning">
                            <div className="card-body">
                                <h5 className="card-title">
                                    <i className="fas fa-compress me-2 text-warning" />
                                    Merge Variants Into Parent
                                    {variantSelection.size > 0 && (
                                        <span className="badge bg-warning text-dark ms-2">{variantSelection.size} selected</span>
                                    )}
                                </h5>
                                <p className="text-muted small mb-3">
                                    Collapse a variant back into this parent product. Stock items and
                                    purchase items move to the parent; the variant row is deleted.
                                </p>
                                <div className="table-responsive">
                                    <table className="table table-sm align-middle">
                                        <thead className="table-light">
                                            <tr>
                                                <th style={{ width: 30 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={variantSelection.size > 0 && variantSelection.size === variants.length}
                                                        onChange={() => {
                                                            if (variantSelection.size === variants.length) {
                                                                setVariantSelection(new Set());
                                                            } else {
                                                                setVariantSelection(new Set(variants.map(getEntryId)));
                                                            }
                                                        }}
                                                    />
                                                </th>
                                                <th>Variant</th>
                                                <th>SKU</th>
                                                <th>Barcode</th>
                                                <th className="text-end">Selling</th>
                                                <th>Terms</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {variants.map(v => {
                                                const vId = getEntryId(v);
                                                return (
                                                    <tr key={vId}>
                                                        <td>
                                                            <input
                                                                type="checkbox"
                                                                checked={variantSelection.has(vId)}
                                                                onChange={() => toggleVariantSelection(vId)}
                                                            />
                                                        </td>
                                                        <td><strong>{v.name || "—"}</strong></td>
                                                        <td className="small">{v.sku || "—"}</td>
                                                        <td className="small">{v.barcode || "—"}</td>
                                                        <td className="text-end small">{currency}{parseFloat(v.selling_price || 0).toFixed(2)}</td>
                                                        <td className="small">{(v.terms || []).map(t => t.name).join(", ") || "—"}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="d-flex justify-content-end">
                                    <button
                                        type="button"
                                        className="btn btn-warning"
                                        onClick={handleMergeVariants}
                                        disabled={mergingVariants || variantSelection.size === 0}
                                    >
                                        {mergingVariants ? (
                                            <><span className="spinner-border spinner-border-sm me-1" />Merging…</>
                                        ) : (
                                            <><i className="fas fa-compress me-1" />Merge {variantSelection.size || ""} variant(s) into parent</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Forward merge — other products INTO this one */}
                    <div className="card mb-3">
                        <div className="card-body">
                            <h5 className="card-title">
                                Merge Other Products Into &quot;{product?.name}&quot;
                                {mergeSelection.size > 0 && (
                                    <span className="badge bg-primary ms-2">{mergeSelection.size} selected</span>
                                )}
                            </h5>
                            <p className="text-muted small mb-3">
                                Search for products that should be absorbed by this one. Their stock
                                items, purchase items, and (optionally) categorisation transfer onto
                                this product. Source rows are kept unless you tick the delete option
                                on the left.
                            </p>
                            <div className="mb-2">
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Search by name, SKU, barcode, supplier, purchase order…"
                                    value={mergeSearch}
                                    onChange={e => setMergeSearch(e.target.value)}
                                />
                            </div>

                            {mergeSearchLoading && <div className="text-muted small mb-2">Searching…</div>}

                            {mergeSearch.trim().length >= 2 && !mergeSearchLoading && (
                                <div className="table-responsive">
                                    <table className="table table-sm align-middle">
                                        <thead className="table-light">
                                            <tr>
                                                <th style={{ width: 30 }}></th>
                                                <th>Product</th>
                                                <th>SKU</th>
                                                <th>Barcode</th>
                                                <th className="text-end">Selling</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mergeResults.map(p => {
                                                const pId = getEntryId(p);
                                                return (
                                                    <tr key={pId}>
                                                        <td>
                                                            <input
                                                                type="checkbox"
                                                                checked={mergeSelection.has(pId)}
                                                                onChange={() => toggleMergeSelection(pId)}
                                                            />
                                                        </td>
                                                        <td><strong>{p.name || "—"}</strong></td>
                                                        <td className="small">{p.sku || "—"}</td>
                                                        <td className="small">{p.barcode || "—"}</td>
                                                        <td className="text-end small">{currency}{parseFloat(p.selling_price || 0).toFixed(2)}</td>
                                                    </tr>
                                                );
                                            })}
                                            {mergeResults.length === 0 && (
                                                <tr><td colSpan={5} className="text-center text-muted small py-3">No matching products.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="d-flex justify-content-end mt-2">
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleMerge}
                                    disabled={merging || mergeSelection.size === 0}
                                >
                                    {merging ? (
                                        <><span className="spinner-border spinner-border-sm me-1" />Merging…</>
                                    ) : (
                                        <>Merge {mergeSelection.size || ""} into this product</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {mergeLog.length > 0 && (
                        <div className="card">
                            <div className="card-body">
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <h5 className="card-title mb-0">Merge Log</h5>
                                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setMergeLog([])}>
                                        Clear
                                    </button>
                                </div>
                                <pre className="bg-light p-3 mb-0 small" style={{ maxHeight: 300, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                                    {mergeLog.join("\n")}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
