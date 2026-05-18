import { useState, useMemo } from "react";
import Link from "next/link";
import OrderableRelationList from "./OrderableRelationList";

/**
 * Generic "Connect + Browse" picker for a manyToMany relation, with a
 * drag-sortable Connected tab and a searchable Browse tab. Mirrors the
 * UX of GroupPickerTabs / PagePickerTabs so every relation editor in the
 * CMS picks/orders related records the same way.
 *
 * Props:
 *  - title, icon, description           card header bits
 *  - selectedIds, allItems              the relation state
 *  - onToggle(docId)                    add or remove a single record
 *  - onReorder(docIds)                  set the new ordered list
 *  - onRemoveAll()                      clear-all helper (optional)
 *  - nameField                          item key used as label (default "name")
 *  - getEditHref(item)                  optional → renders an "open" link
 *  - renderBadges(item)                 optional → custom badge content
 *  - searchKeys                         keys searched in the Browse tab
 *  - emptyConnectedText                 hint when no records are connected
 */
export default function RelationPickerTabs({
    title,
    icon = "fas fa-link",
    description,
    selectedIds,
    allItems,
    onToggle,
    onReorder,
    onRemoveAll,
    nameField = "name",
    getEditHref,
    renderBadges,
    searchKeys,
    emptyConnectedText,
}) {
    const [activeTab, setActiveTab] = useState("connected");
    const [searchText, setSearchText] = useState("");

    const itemsById = useMemo(() => {
        const map = {};
        for (const item of allItems || []) map[item.documentId] = item;
        return map;
    }, [allItems]);

    const effectiveSearchKeys = searchKeys || [nameField];

    const filteredItems = useMemo(() => {
        if (!searchText.trim()) return allItems || [];
        const q = searchText.toLowerCase();
        return (allItems || []).filter(item =>
            effectiveSearchKeys.some(k => String(item[k] || "").toLowerCase().includes(q))
        );
    }, [allItems, searchText, effectiveSearchKeys]);

    const renderRow = (item, { connected }) => (
        <div className="d-flex align-items-center gap-2 w-100">
            <span className="flex-grow-1">
                {item[nameField]}
                {renderBadges && renderBadges(item)}
            </span>
            {getEditHref && (
                <Link
                    href={getEditHref(item)}
                    className="btn btn-sm btn-outline-primary"
                    title="Open"
                    onClick={(e) => e.stopPropagation()}
                >
                    <i className="fas fa-external-link-alt"></i>
                </Link>
            )}
            {!connected && (
                <button
                    type="button"
                    className="btn btn-sm btn-outline-success"
                    onClick={() => onToggle(item.documentId)}
                    title="Add"
                >
                    <i className="fas fa-plus"></i>
                </button>
            )}
        </div>
    );

    return (
        <div className="card mb-3">
            <div className="card-header d-flex align-items-center">
                <i className={`${icon} me-2`}></i>
                <strong>{title}</strong>
                <span className="badge bg-primary ms-2">{selectedIds.length}</span>
            </div>
            <div className="card-body">
                {description && <p className="text-muted small mb-2">{description}</p>}
                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === "connected" ? "active" : ""}`}
                            onClick={() => setActiveTab("connected")}
                        >
                            <i className="fas fa-link me-1"></i>
                            Connected <span className="badge bg-success ms-1">{selectedIds.length}</span>
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === "all" ? "active" : ""}`}
                            onClick={() => setActiveTab("all")}
                        >
                            <i className="fas fa-search me-1"></i>
                            Browse <span className="badge bg-secondary ms-1">{(allItems || []).length}</span>
                        </button>
                    </li>
                </ul>

                {activeTab === "connected" && (
                    <>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                            <small className="text-muted">
                                {selectedIds.length} selected · drag to reorder
                            </small>
                            {selectedIds.length > 0 && onRemoveAll && (
                                <button className="btn btn-sm btn-outline-danger" onClick={onRemoveAll}>
                                    <i className="fas fa-times me-1"></i>Clear All
                                </button>
                            )}
                        </div>
                        <OrderableRelationList
                            selectedIds={selectedIds}
                            optionsById={itemsById}
                            onReorder={onReorder}
                            onRemove={onToggle}
                            renderItem={(item) => renderRow(item, { connected: true })}
                            emptyText={emptyConnectedText || 'Nothing connected. Use the "Browse" tab to add records.'}
                        />
                    </>
                )}

                {activeTab === "all" && (
                    <>
                        <input
                            type="text"
                            className="form-control form-control-sm mb-2"
                            placeholder={`Search ${title.toLowerCase()}...`}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                        {filteredItems.length === 0 ? (
                            <p className="text-muted small mb-0">No matches.</p>
                        ) : (
                            <div className="list-group list-group-flush">
                                {filteredItems.map(item => {
                                    const selected = selectedIds.includes(item.documentId);
                                    return (
                                        <div
                                            key={item.documentId}
                                            className={`list-group-item d-flex align-items-center gap-2 ${selected ? "bg-success-subtle" : ""}`}
                                        >
                                            <span className="flex-grow-1">
                                                {selected && <i className="fas fa-check text-success me-1"></i>}
                                                {item[nameField]}
                                                {renderBadges && renderBadges(item)}
                                            </span>
                                            {getEditHref && (
                                                <Link
                                                    href={getEditHref(item)}
                                                    className="btn btn-sm btn-outline-primary"
                                                    title="Open"
                                                >
                                                    <i className="fas fa-external-link-alt"></i>
                                                </Link>
                                            )}
                                            <button
                                                type="button"
                                                className={`btn btn-sm ${selected ? "btn-outline-danger" : "btn-outline-success"}`}
                                                onClick={() => onToggle(item.documentId)}
                                                title={selected ? "Remove" : "Add"}
                                            >
                                                <i className={`fas ${selected ? "fa-times" : "fa-plus"}`}></i>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
