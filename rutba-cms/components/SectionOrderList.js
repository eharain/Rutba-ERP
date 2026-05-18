import { useMemo } from "react";
import { OrderList } from "primereact/orderlist";

/**
 * Drag-sortable list of named page sections. Each row shows the section
 * label plus an "empty" hint when the corresponding content is missing
 * (the section won't render on the public page, but still has a slot in
 * the list so the user can decide where it would land once filled in).
 *
 * `sections` is `[{ key, label, present }]` in the desired display order.
 * `onReorder` is called with the new ordered list of keys.
 */
export default function SectionOrderList({ sections, onReorder }) {
    const items = useMemo(() => sections, [sections]);

    const itemTemplate = (item) => (
        <div className="d-flex align-items-center justify-content-between w-100 gap-2">
            <span className="d-flex align-items-center gap-2">
                <i className="fas fa-grip-vertical text-muted small" />
                <span>{item.label}</span>
            </span>
            {!item.present && (
                <span className="badge bg-light text-muted small">empty — hidden</span>
            )}
        </div>
    );

    return (
        <OrderList
            value={items}
            onChange={(e) => onReorder(e.value.map(i => i.key))}
            itemTemplate={itemTemplate}
            dataKey="key"
            dragdrop
            listStyle={{ maxHeight: "320px" }}
        />
    );
}
