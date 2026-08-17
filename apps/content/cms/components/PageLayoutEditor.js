import { useMemo } from "react";
import { OrderList } from "primereact/orderlist";
import Link from "next/link";

/**
 * Flat drag-sort panel for the public page's vertical layout.
 *
 * Sections and individual connected product groups live at the same
 * level — each is its own row. The user drags sections to inject them
 * between groups; groups keep their relation `_ord` and are not
 * normally moved from this view (though OrderList will let them be
 * reordered too, in which case the caller decides how to react).
 *
 * The component is dumb: the parent owns priorities + the relation
 * order and rebuilds `rows` from them. On reorder the parent gets
 * the new row sequence and projects it back onto the storage shape.
 *
 * Props
 *  - rows                    [{ kind: "section"|"group", key|documentId, ... }]
 *  - onReorder(newRows)      called with the new row sequence
 *  - sectionLabels           { [sectionKey]: string }
 *  - sectionPresence         { [sectionKey]: boolean }  empty → "hidden" hint
 *  - onRemoveGroup(docId)    optional remove button on group rows
 */
export default function PageLayoutEditor({
    rows,
    onReorder,
    sectionLabels,
    sectionPresence,
    onRemoveGroup,
}) {
    // Attach a stable identity for OrderList. Sections key by their
    // section name; groups key by "g:<documentId>".
    const items = useMemo(() => (rows || []).map((row) => {
        if (row.kind === "group") {
            return {
                key: `g:${row.documentId}`,
                kind: "group",
                documentId: row.documentId,
                label: row.data?.name || "Product group (loading…)",
                sublabel: row.data?.layout || null,
                present: !!row.data,
            };
        }
        return {
            key: `s:${row.key}`,
            kind: "section",
            sectionKey: row.key,
            label: sectionLabels?.[row.key] || row.key,
            present: sectionPresence?.[row.key] !== false,
        };
    }), [rows, sectionLabels, sectionPresence]);

    const handleChange = (e) => {
        const newRows = e.value.map((item) => {
            if (item.kind === "group") {
                return { kind: "group", documentId: item.documentId, data: { name: item.label, layout: item.sublabel } };
            }
            return { kind: "section", key: item.sectionKey };
        });
        onReorder(newRows);
    };

    const itemTemplate = (item) => (
        <div className="d-flex align-items-center justify-content-between w-100 gap-2">
            <span className="d-flex align-items-center gap-2">
                <i className="fas fa-grip-vertical text-muted small" />
                {item.kind === "group" ? (
                    <>
                        <i className="fas fa-cube text-secondary small" />
                        <span>{item.label}</span>
                        {item.sublabel && (
                            <span className="badge bg-light text-dark" style={{ fontSize: "0.65em" }}>
                                {item.sublabel}
                            </span>
                        )}
                    </>
                ) : (
                    <strong>{item.label}</strong>
                )}
            </span>
            <span className="d-flex align-items-center gap-1">
                {item.kind === "group" && (
                    <Link
                        href={`/${item.documentId}/product-group`}
                        className="btn btn-sm btn-outline-primary"
                        title="Open product group"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <i className="fas fa-external-link-alt" />
                    </Link>
                )}
                {item.kind === "group" && onRemoveGroup && (
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={(e) => { e.stopPropagation(); onRemoveGroup(item.documentId); }}
                        title="Remove from page"
                    >
                        <i className="fas fa-times" />
                    </button>
                )}
                {!item.present && (
                    <span className="badge bg-light text-muted">empty — hidden</span>
                )}
            </span>
        </div>
    );

    return (
        <OrderList
            value={items}
            onChange={handleChange}
            itemTemplate={itemTemplate}
            dataKey="key"
            dragdrop
            listStyle={{ maxHeight: "640px" }}
        />
    );
}
