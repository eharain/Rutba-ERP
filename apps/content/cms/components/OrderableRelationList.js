import { useMemo } from "react";
import { OrderList } from "primereact/orderlist";

// Drag-to-reorder list backed by PrimeReact OrderList. Resolves the ordered
// `selectedIds` against `optionsById` so callers can render rich rows (logo,
// badges, open-link) via `renderItem`. Items whose ids are not yet in the
// pool (still loading) are skipped silently — their position is preserved
// in the ids array but they don't show until the option arrives.
export default function OrderableRelationList({
    selectedIds,
    optionsById,
    onReorder,
    renderItem,
    onRemove,
    emptyText = "Nothing connected yet.",
    listStyle,
}) {
    const items = useMemo(() => {
        return (selectedIds || [])
            .map(id => optionsById?.[id])
            .filter(Boolean);
    }, [selectedIds, optionsById]);

    if (!items.length) {
        return <p className="text-muted small mb-0">{emptyText}</p>;
    }

    const itemTemplate = (item) => (
        <div className="d-flex align-items-center justify-content-between w-100 gap-2">
            <div className="flex-grow-1">{renderItem(item)}</div>
            {onRemove && (
                <button
                    type="button"
                    className="btn btn-sm btn-outline-danger flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); onRemove(item.documentId); }}
                    title="Remove"
                >
                    <i className="fas fa-times"></i>
                </button>
            )}
        </div>
    );

    return (
        <OrderList
            value={items}
            onChange={onReorder ? (e) => onReorder(e.value.map(i => i.documentId)) : undefined}
            itemTemplate={itemTemplate}
            dataKey="documentId"
            dragdrop={!!onReorder}
            listStyle={listStyle || { maxHeight: "480px" }}
        />
    );
}
