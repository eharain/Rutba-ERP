import React from 'react';

/**
 * ListPageLayout — the canonical shape every "X list" page in the ERP uses.
 *
 * Why this exists: each app (rutba-cms, pos-stock, pos-sale) was hand-rolling
 * its own list-page chrome, which drifted across pages — different header
 * spacing, different filter-card padding, different pagination components,
 * different empty-state copy. This primitive locks the chrome and lets each
 * caller pass the parts that differ: title, filter controls, table body,
 * bulk-action row, pagination, empty state.
 *
 * Slots (all optional except `title` and `children`):
 *   title         — page heading text (string) or full JSX node
 *   subtitle      — small grey line under the title (string)
 *   headerActions — buttons to render top-right next to the title
 *   filters       — anything you want inside the grey filter card
 *                   (search input + dropdowns); pass an array of nodes
 *                   for the standard "row of small inputs" layout, or a
 *                   single node for full freedom
 *   bulkActions   — node shown only when `selectedCount > 0`; the count
 *                   pill is rendered automatically before whatever you pass
 *   selectedCount — number of selected rows (controls bulkActions visibility)
 *   pagination    — node shown below the table (any pagination control)
 *   loading       — boolean, shows a spinner row instead of empty state
 *   emptyState    — node shown when `children` is falsy and !loading
 *   children      — your <table> or grid markup
 */
export default function ListPageLayout({
    title,
    subtitle,
    headerActions,
    filters,
    bulkActions,
    selectedCount = 0,
    pagination,
    loading = false,
    emptyState,
    children,
}) {
    return (
        <div className="p-3">
            {/* Header — title + subtitle on the left, actions on the right */}
            <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
                <div>
                    {typeof title === 'string' ? <h4 className="mb-0">{title}</h4> : title}
                    {subtitle && <div className="text-muted small mt-1">{subtitle}</div>}
                </div>
                {headerActions && (
                    <div className="d-flex flex-wrap gap-2 align-items-center">{headerActions}</div>
                )}
            </div>

            {/* Filter strip — only renders when caller provides filter controls */}
            {filters && (
                <div className="card mb-3">
                    <div className="card-body py-2 px-3">
                        {Array.isArray(filters) ? (
                            <div className="row g-2 align-items-center">
                                {filters.map((f, i) => (
                                    <div key={i} className="col-12 col-md-auto flex-grow-1">{f}</div>
                                ))}
                            </div>
                        ) : (
                            filters
                        )}
                    </div>
                </div>
            )}

            {/* Bulk-actions bar — appears between filters and table when rows are selected */}
            {bulkActions && selectedCount > 0 && (
                <div className="alert alert-info py-2 d-flex flex-wrap align-items-center gap-2 mb-3">
                    <span className="badge bg-primary">
                        {selectedCount} selected
                    </span>
                    {bulkActions}
                </div>
            )}

            {/* Table / grid body */}
            <div className="card">
                <div className="card-body p-0">
                    {loading ? (
                        <div className="text-center text-muted py-5">
                            <span className="spinner-border spinner-border-sm me-2" />
                            Loading…
                        </div>
                    ) : children}
                </div>

                {pagination && (
                    <div className="card-footer bg-white border-top-0">
                        {pagination}
                    </div>
                )}
            </div>

            {/* Empty state — rendered outside the card so it can be illustrative */}
            {!loading && !children && emptyState && (
                <div className="text-center text-muted py-5">{emptyState}</div>
            )}
        </div>
    );
}

/**
 * Standard "+ Add" button. Use as a headerAction prop on ListPageLayout.
 * Optional but recommended so every list page has the same affordance.
 */
export function AddButton({ label = 'Add', href, onClick, disabled, icon = 'fa-plus' }) {
    const className = 'btn btn-sm btn-primary';
    const content = (
        <>
            <i className={`fas ${icon} me-1`}></i>{label}
        </>
    );
    if (href) {
        return <a className={className} href={href}>{content}</a>;
    }
    return (
        <button type="button" className={className} onClick={onClick} disabled={disabled}>
            {content}
        </button>
    );
}
