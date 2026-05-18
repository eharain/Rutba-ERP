import { useMemo } from "react";
import { OrderList } from "primereact/orderlist";
import Link from "next/link";

/**
 * One unified drag-sort panel for the public page's vertical layout.
 *
 * - Outer list: the 6 cms-page sections, in render order.
 * - When the active row is "Product Groups", the connected groups appear
 *   as a nested drag-sort list below the label so the user can reorder
 *   them in the same view they pick the section position from.
 *
 * Sections with no content show an "empty — hidden" hint; they keep a
 * slot in the order so the user can position them ahead of time.
 *
 * Props
 *  - sections                    [{ key, label, present }]    outer rows in current order
 *  - onReorderSections(keys)     called with the new section-key array
 *  - connectedGroups             [{ documentId, name, layout? }]  in current order
 *  - onReorderGroups(docIds)     called with the new product-group id order
 *  - onRemoveGroup(docId)        optional — render a remove button per group row
 */
export default function PageLayoutEditor({
    sections,
    onReorderSections,
    connectedGroups = [],
    onReorderGroups,
    onRemoveGroup,
}) {
    const sectionItems = useMemo(() => sections, [sections]);

    const renderGroupRow = (g) => (
        <div className="d-flex align-items-center justify-content-between w-100 gap-2">
            <span className="d-flex align-items-center gap-2">
                <i className="fas fa-grip-vertical text-muted small" />
                <span>{g.name}</span>
                {g.layout && (
                    <span className="badge bg-light text-dark" style={{ fontSize: "0.65em" }}>
                        {g.layout}
                    </span>
                )}
            </span>
            <span className="d-flex align-items-center gap-1">
                <Link
                    href={`/${g.documentId}/product-group`}
                    className="btn btn-sm btn-outline-primary"
                    title="Open product group"
                    onClick={(e) => e.stopPropagation()}
                >
                    <i className="fas fa-external-link-alt" />
                </Link>
                {onRemoveGroup && (
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={(e) => { e.stopPropagation(); onRemoveGroup(g.documentId); }}
                        title="Remove"
                    >
                        <i className="fas fa-times" />
                    </button>
                )}
            </span>
        </div>
    );

    const sectionTemplate = (item) => {
        const isGroups = item.key === "product_groups";
        return (
            <div className="w-100">
                <div className="d-flex align-items-center justify-content-between gap-2">
                    <span className="d-flex align-items-center gap-2">
                        <i className="fas fa-grip-vertical text-muted small" />
                        <strong>{item.label}</strong>
                        {isGroups && (
                            <span className="badge bg-primary">{connectedGroups.length}</span>
                        )}
                    </span>
                    {!item.present && (
                        <span className="badge bg-light text-muted">empty — hidden</span>
                    )}
                </div>

                {isGroups && connectedGroups.length > 0 && (
                    <div
                        className="mt-2 ms-4"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <OrderList
                            value={connectedGroups}
                            onChange={(e) => onReorderGroups(e.value.map(g => g.documentId))}
                            itemTemplate={renderGroupRow}
                            dataKey="documentId"
                            dragdrop
                            listStyle={{ maxHeight: "260px" }}
                        />
                    </div>
                )}
            </div>
        );
    };

    return (
        <OrderList
            value={sectionItems}
            onChange={(e) => onReorderSections(e.value.map(i => i.key))}
            itemTemplate={sectionTemplate}
            dataKey="key"
            dragdrop
            listStyle={{ maxHeight: "640px" }}
        />
    );
}
