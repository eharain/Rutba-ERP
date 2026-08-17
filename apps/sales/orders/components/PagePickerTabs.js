import { useState, useMemo } from "react";
import Link from "next/link";

export default function PagePickerTabs({ allPages, selectedPageIds, onToggle, onRemoveAll, title = "Related Pages", icon = "fas fa-link", description }) {
    const [activeTab, setActiveTab] = useState("connected");
    const [searchText, setSearchText] = useState("");
    const [filterPageType, setFilterPageType] = useState("");

    const pageTypes = useMemo(() => {
        const types = new Set(allPages.map(p => p.page_type).filter(Boolean));
        return [...types].sort();
    }, [allPages]);

    const connectedPages = useMemo(
        () => allPages.filter(p => selectedPageIds.includes(p.documentId)),
        [allPages, selectedPageIds]
    );

    const filteredPages = useMemo(() => {
        let result = allPages;
        if (filterPageType) {
            result = result.filter(p => p.page_type === filterPageType);
        }
        if (searchText.trim()) {
            const q = searchText.toLowerCase();
            result = result.filter(p => p.title?.toLowerCase().includes(q) || p.page_type?.toLowerCase().includes(q));
        }
        return result;
    }, [allPages, searchText, filterPageType]);

    const renderPageItem = (p) => {
        const selected = selectedPageIds.includes(p.documentId);
        return (
            <div key={p.documentId} className="d-inline-flex align-items-center gap-1">
                <button
                    type="button"
                    className={`btn btn-sm ${selected ? "btn-info text-white" : "btn-outline-secondary"}`}
                    onClick={() => onToggle(p.documentId)}
                >
                    {selected && <i className="fas fa-check me-1"></i>}
                    {p.title}
                    {p.page_type && <span className="badge bg-light text-dark ms-1" style={{ fontSize: "0.65em" }}>{p.page_type}</span>}
                </button>
                <Link
                    href={`/${p.documentId}/cms-page`}
                    className="btn btn-sm btn-outline-primary"
                    title="Open page"
                >
                    <i className="fas fa-external-link-alt"></i>
                </Link>
            </div>
        );
    };

    return (
        <div className="card mb-3">
            <div className="card-header d-flex align-items-center">
                <i className={`${icon} me-2`}></i>
                <strong>{title}</strong>
                <span className="badge bg-primary ms-2">{selectedPageIds.length}</span>
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
                            Connected <span className="badge bg-success ms-1">{selectedPageIds.length}</span>
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === "all" ? "active" : ""}`}
                            onClick={() => setActiveTab("all")}
                        >
                            <i className="fas fa-search me-1"></i>
                            All Pages <span className="badge bg-secondary ms-1">{allPages.length}</span>
                        </button>
                    </li>
                </ul>

                {activeTab === "connected" && (
                    <>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                            <small className="text-muted">{selectedPageIds.length} page{selectedPageIds.length !== 1 ? "s" : ""} selected</small>
                            {selectedPageIds.length > 0 && onRemoveAll && (
                                <button className="btn btn-sm btn-outline-danger" onClick={onRemoveAll}>
                                    <i className="fas fa-times me-1"></i>Clear All
                                </button>
                            )}
                        </div>
                        {connectedPages.length === 0 ? (
                            <p className="text-muted small">No related pages connected. Use the "All Pages" tab to add some.</p>
                        ) : (
                            <div className="d-flex flex-wrap gap-2">
                                {connectedPages.map(renderPageItem)}
                            </div>
                        )}
                    </>
                )}

                {activeTab === "all" && (
                    <>
                        <div className="d-flex gap-2 mb-2">
                            <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="Search pages..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                            />
                            <select
                                className="form-select form-select-sm"
                                style={{ maxWidth: 160 }}
                                value={filterPageType}
                                onChange={e => setFilterPageType(e.target.value)}
                            >
                                <option value="">All Types</option>
                                {pageTypes.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        {filteredPages.length === 0 ? (
                            <p className="text-muted small">No pages found.</p>
                        ) : (
                            <div className="d-flex flex-wrap gap-2">
                                {filteredPages.map(renderPageItem)}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
