import React from 'react';

/**
 * Compact pagination strip — replaces both the hand-rolled Bootstrap
 * pagination in rutba-cms and the Material-UI TablePagination in pos
 * apps. Single source of truth for "X to Y of Z" + page-size selector +
 * prev/next + jump-to-page.
 *
 * Props:
 *   page      — 1-based current page (number)
 *   pageSize  — rows per page (number)
 *   total     — total rows across all pages (number, optional)
 *   onPage    — (newPage) => void
 *   onPageSize — (newPageSize) => void; if omitted, the size selector is hidden
 *   pageSizeOptions — number[] for the dropdown (default [25, 50, 100, 200])
 */
export default function ListPagination({
    page = 1,
    pageSize = 50,
    total,
    onPage,
    onPageSize,
    pageSizeOptions = [25, 50, 100, 200],
}) {
    const hasTotal = Number.isFinite(total);
    const totalPages = hasTotal ? Math.max(1, Math.ceil(total / pageSize)) : null;
    const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const endRow = hasTotal ? Math.min(total, page * pageSize) : null;

    const canPrev = page > 1;
    const canNext = totalPages == null ? true : page < totalPages;

    return (
        <div className="d-flex flex-wrap align-items-center gap-3 small">
            {/* Row counter */}
            <div className="text-muted">
                {hasTotal
                    ? (total === 0 ? 'No results' : `${startRow}–${endRow} of ${total}`)
                    : `Page ${page}`}
            </div>

            {/* Page-size selector — only shown when caller wires onPageSize */}
            {onPageSize && (
                <div className="d-flex align-items-center gap-2">
                    <span className="text-muted">Rows</span>
                    <select
                        className="form-select form-select-sm"
                        style={{ width: 80 }}
                        value={pageSize}
                        onChange={(e) => onPageSize(Number(e.target.value))}
                    >
                        {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
            )}

            {/* Prev / Next */}
            <div className="ms-auto d-flex align-items-center gap-1">
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={!canPrev}
                    onClick={() => onPage(page - 1)}
                    title="Previous page"
                >
                    <i className="fas fa-chevron-left" />
                </button>
                {totalPages != null && totalPages > 1 && (
                    <input
                        type="number"
                        min={1}
                        max={totalPages}
                        className="form-control form-control-sm text-center"
                        style={{ width: 70 }}
                        value={page}
                        onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (Number.isFinite(v) && v >= 1 && v <= totalPages) onPage(v);
                        }}
                        title={`Page ${page} of ${totalPages}`}
                    />
                )}
                {totalPages != null && totalPages > 1 && (
                    <span className="text-muted">of {totalPages}</span>
                )}
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={!canNext}
                    onClick={() => onPage(page + 1)}
                    title="Next page"
                >
                    <i className="fas fa-chevron-right" />
                </button>
            </div>
        </div>
    );
}
