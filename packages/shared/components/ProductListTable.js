import { Fragment } from "react";
import Link from "next/link";
import { MediaUtilsEndpoints } from "@rutba/api-provider/endpoints";
import { SortableTh } from "./Table";

// Shared product list table, extracted verbatim from the CMS products page so
// every app renders the exact same columns, sorting, selection, publish cell
// and (optionally) expandable child rows. The variable bits are injected:
//   - selection            → pass selectedIds (a Set) + toggles
//   - interactive publish   → pass onPublish/onUnpublish (else a static badge)
//   - row actions           → renderRowActions(product) (else Edit + View)
//   - expansion             → EITHER variantChildren(product) to render
//                             product-shaped child rows (CMS variants), OR
//                             renderExpandedContent(product) for a full-width
//                             panel (e.g. a product's social posts).
//
// The same cell renderer draws both parent and child (variant) rows so their
// appearance can never drift apart.

const dateShort = (d) =>
    d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

function PublishedCell({ product, publishing, onPublish, onUnpublish }) {
    const docId = product.documentId;
    // Static (read-only) badge when the caller can't/shouldn't toggle publish.
    if (!onPublish || !onUnpublish) {
        return product._isPublished
            ? <span className="list-status" style={{ background: "#198754", color: "#fff", borderRadius: 4, padding: "2px 8px", display: "inline-block" }}>
                <i className="fas fa-check me-1"></i>{product._publishedAt ? dateShort(product._publishedAt) : "Published"}
            </span>
            : <span className="list-status" style={{ background: "#e9ecef", color: "#495057", borderRadius: 4, padding: "2px 8px", display: "inline-block" }}>Draft</span>;
    }
    return product._isPublished
        ? <button className="list-status btn border-0" style={{ background: "#198754", color: "#fff" }} onClick={() => onUnpublish(docId)} disabled={publishing[docId]} title="Click to unpublish">
            {publishing[docId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>{product._publishedAt ? dateShort(product._publishedAt) : "Published"}</>}
        </button>
        : <button className="list-status btn border-0" style={{ background: "#e9ecef", color: "#495057" }} onClick={() => onPublish(docId)} disabled={publishing[docId]} title="Click to publish">
            {publishing[docId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
        </button>;
}

function DefaultRowActions({ product, editHref, buildWebUrl }) {
    const web = buildWebUrl ? buildWebUrl(product) : null;
    return (
        <div className="list-actions">
            {editHref && (
                <Link className="btn btn-outline-primary" href={editHref(product)}>Edit</Link>
            )}
            {web && (
                <a className="btn btn-outline-secondary" href={web} target="_blank" rel="noopener noreferrer" title="Open on the storefront">
                    <i className="fas fa-eye me-1"></i>View
                </a>
            )}
        </div>
    );
}

export default function ProductListTable({
    products = [],
    currency = "",
    // sorting
    sortField, sortDir, onSort,
    // selection (optional)
    selectedIds = null,
    onToggleSelect,
    allSelected = false,
    onToggleSelectAll,
    // expansion (optional)
    expandable = false,
    expandedProducts = {},
    onToggleExpand,
    variantChildren,          // (product) => { loading, items }
    renderExpandedContent,    // (product) => JSX
    childLoadingLabel = "Loading variants...",
    childEmptyLabel = "No variants",
    // publish cell (interactive only if both handlers passed)
    publishing = {},
    onPublish,
    onUnpublish,
    // row actions
    renderRowActions,
    editHref,
    buildWebUrl,
}) {
    const selectable = selectedIds instanceof Set;
    const colSpan = 13 + (selectable ? 1 : 0) + (expandable ? 1 : 0);

    const actionsFor = (p) =>
        renderRowActions ? renderRowActions(p) : <DefaultRowActions product={p} editHref={editHref} buildWebUrl={buildWebUrl} />;

    const renderRow = (p, isChild) => (
        <tr key={isChild ? `child-${p.id}` : p.id} className={isChild ? "table-light" : undefined}>
            {selectable && (
                <td>
                    {isChild ? null : (
                        <input type="checkbox" checked={selectedIds.has(p.documentId)} onChange={() => onToggleSelect?.(p.documentId)} />
                    )}
                </td>
            )}
            {expandable && (
                <td>
                    {isChild ? null : (
                        <button className="btn btn-sm btn-link p-0" onClick={() => onToggleExpand?.(p)} title="Show/hide details">
                            <i className={`fas fa-chevron-${expandedProducts[p.documentId] ? "down" : "right"}`}></i>
                        </button>
                    )}
                </td>
            )}
            <td>
                {p.logo?.url ? (
                    <img src={MediaUtilsEndpoints.strapiImageUrl(p.logo)} alt={p.name} style={{ width: isChild ? 30 : 40, height: isChild ? 30 : 40, objectFit: "cover", borderRadius: 4 }} />
                ) : (
                    <span className="text-muted"><i className="fas fa-image" style={isChild ? { fontSize: "0.8em" } : undefined}></i></span>
                )}
            </td>
            <td className="small text-muted">{p.id}</td>
            <td className={isChild ? "ps-4" : undefined}>
                {isChild
                    ? <><i className="fas fa-level-up-alt fa-rotate-90 me-1 text-muted" style={{ fontSize: "0.8em" }}></i>{p.name}</>
                    : <strong>{p.name}</strong>}
            </td>
            <td>{p.sku || "—"}</td>
            <td>{currency}{parseFloat(p.selling_price || 0).toFixed(2)}</td>
            <td>{p.stock_quantity ?? "—"}</td>
            <td>{(p.categories || []).map(c => c.name).join(", ") || "—"}</td>
            <td>{(p.brands || []).map(b => b.name).join(", ") || "—"}</td>
            <td>{(p.purchase_items || []).map(pi => pi.purchase?.orderId).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "—"}</td>
            <td className="small text-nowrap">{dateShort(p.createdAt)}</td>
            <td className="small text-nowrap">{dateShort(p.updatedAt)}</td>
            <td className="small text-nowrap">
                <PublishedCell product={p} publishing={publishing} onPublish={onPublish} onUnpublish={onUnpublish} />
            </td>
            <td>{actionsFor(p)}</td>
        </tr>
    );

    const renderExpansion = (p) => {
        if (!expandable || !expandedProducts[p.documentId]) return null;
        if (variantChildren) {
            const { loading, items } = variantChildren(p) || {};
            if (loading) return <tr><td colSpan={colSpan} className="text-center text-muted">{childLoadingLabel}</td></tr>;
            if (!items || items.length === 0) return <tr><td colSpan={colSpan} className="text-center text-muted">{childEmptyLabel}</td></tr>;
            return items.map(v => renderRow(v, true));
        }
        if (renderExpandedContent) {
            return (
                <tr className="table-light">
                    <td colSpan={colSpan}>{renderExpandedContent(p)}</td>
                </tr>
            );
        }
        return null;
    };

    if (!products || products.length === 0) return null;

    return (
        <div className="table-responsive">
            <table className="table table-hover list-table">
                <thead>
                    <tr>
                        {selectable && (
                            <th style={{ width: 30 }}>
                                <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} title="Select all" />
                            </th>
                        )}
                        {expandable && <th style={{ width: 30 }}></th>}
                        <th style={{ width: 50 }}></th>
                        <SortableTh label="ID" field="id" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                        <SortableTh label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                        <SortableTh label="SKU" field="sku" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                        <SortableTh label="Price" field="selling_price" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                        <SortableTh label="Stock" field="stock_quantity" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                        <th>Categories</th>
                        <th>Brands</th>
                        <th>Purchase #</th>
                        <SortableTh label="Created" field="createdAt" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                        <SortableTh label="Modified" field="updatedAt" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                        <th>Published</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map(p => (
                        <Fragment key={p.id}>
                            {renderRow(p, false)}
                            {renderExpansion(p)}
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
