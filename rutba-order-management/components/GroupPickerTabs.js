import { useState, useMemo } from "react";
import Link from "next/link";

export default function GroupPickerTabs({ allGroups, selectedGroupIds, onToggle, onRemoveAll }) {
    const [activeTab, setActiveTab] = useState("connected");
    const [searchText, setSearchText] = useState("");

    const connectedGroups = useMemo(
        () => allGroups.filter(g => selectedGroupIds.includes(g.documentId)),
        [allGroups, selectedGroupIds]
    );

    const filteredGroups = useMemo(() => {
        if (!searchText.trim()) return allGroups;
        const q = searchText.toLowerCase();
        return allGroups.filter(g => g.name?.toLowerCase().includes(q));
    }, [allGroups, searchText]);

    const LAYOUT_LABELS = {
        "hero-slider": "Hero Slider",
        "grid-4": "Grid 4",
        "grid-6": "Grid 6",
        "carousel": "Carousel",
        "banner-single": "Banner",
        "list": "List",
    };

    const renderGroupItem = (g) => {
        const selected = selectedGroupIds.includes(g.documentId);
        return (
            <div key={g.documentId} className="d-inline-flex align-items-center gap-1">
                <button
                    type="button"
                    className={`btn btn-sm ${selected ? "btn-success" : "btn-outline-secondary"}`}
                    onClick={() => onToggle(g.documentId)}
                >
                    {selected && <i className="fas fa-check me-1"></i>}
                    {g.name}
                    {g.layout && <span className="badge bg-light text-dark ms-1" style={{ fontSize: "0.65em" }}>{LAYOUT_LABELS[g.layout] || g.layout}</span>}
                    {g.priority != null && <span className="badge bg-secondary ms-1" style={{ fontSize: "0.65em" }}>P{g.priority}</span>}
                </button>
                <Link
                    href={`/${g.documentId}/product-group`}
                    className="btn btn-sm btn-outline-primary"
                    title="Open product group"
                >
                    <i className="fas fa-external-link-alt"></i>
                </Link>
            </div>
        );
    };

    return (
        <div className="card mb-3">
            <div className="card-header d-flex align-items-center">
                <i className="fas fa-layer-group me-2"></i>
                <strong>Product Groups</strong>
                <span className="badge bg-primary ms-2">{selectedGroupIds.length}</span>
            </div>
            <div className="card-body">
                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === "connected" ? "active" : ""}`}
                            onClick={() => setActiveTab("connected")}
                        >
                            <i className="fas fa-link me-1"></i>
                            Connected <span className="badge bg-success ms-1">{selectedGroupIds.length}</span>
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === "all" ? "active" : ""}`}
                            onClick={() => setActiveTab("all")}
                        >
                            <i className="fas fa-search me-1"></i>
                            All Groups <span className="badge bg-secondary ms-1">{allGroups.length}</span>
                        </button>
                    </li>
                </ul>

                {activeTab === "connected" && (
                    <>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                            <small className="text-muted">{selectedGroupIds.length} group{selectedGroupIds.length !== 1 ? "s" : ""} selected</small>
                            {selectedGroupIds.length > 0 && onRemoveAll && (
                                <button className="btn btn-sm btn-outline-danger" onClick={onRemoveAll}>
                                    <i className="fas fa-times me-1"></i>Clear All
                                </button>
                            )}
                        </div>
                        {connectedGroups.length === 0 ? (
                            <p className="text-muted small">No product groups connected. Use the "All Groups" tab to add some.</p>
                        ) : (
                            <div className="d-flex flex-wrap gap-2">
                                {connectedGroups.map(renderGroupItem)}
                            </div>
                        )}
                    </>
                )}

                {activeTab === "all" && (
                    <>
                        <div className="mb-2">
                            <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="Search groups..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                            />
                        </div>
                        {filteredGroups.length === 0 ? (
                            <p className="text-muted small">No groups found.</p>
                        ) : (
                            <div className="d-flex flex-wrap gap-2">
                                {filteredGroups.map(renderGroupItem)}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
