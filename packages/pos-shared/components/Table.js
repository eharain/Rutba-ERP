import React from "react";
import { useState, useEffect } from "react";


// Simple Table Components
export function Table({ children }) {
    return <table style={{ width: "100%", borderCollapse: "collapse" }}>{children}</table>;
}
export function TableHead({ children }) {
    return <thead style={{ background: "lightYellow" }}>{children}</thead>;
}
export function TableBody({ children }) {
    return <tbody>{children}</tbody>;
}
export function TableRow({ children, style }) {
    return <tr style={style}>{children}</tr>;
}
export function TableCell({ children, align, colSpan, title, onClick, style }) {
    return (
        <td
            title={title}
            colSpan={colSpan}
            onClick={onClick}
            style={{
                border: "1px solid Black",
                color: "gray",
                padding: "8px",
                textAlign: align || "left",
                wordWrap: 'break-word',
                ...style,
            }}
        >
            {children}
        </td>
    );
}
/**
 * Sortable <th> for list-page tables. One canonical implementation used by
 * every "X list" across rutba-cms and pos-stock — replaces the three
 * near-identical local copies (products.js, products-bulk-edit.js, cms
 * products.js) that all rendered slightly different arrows.
 *
 * Always shows a faded sort glyph so columns advertise that they can be
 * sorted; brightens and flips direction once active.
 *
 * Click semantics are owned by the parent: pass `onSort(field)` and toggle
 * the direction in your handler. We don't manage state here because callers
 * typically need to also reset the page, persist sort in the URL, etc.
 *
 * Props:
 *   field      — column key (passed back to onSort)
 *   label      — header text
 *   sortField  — the column currently being sorted (string)
 *   sortDir    — 'asc' | 'desc'
 *   onSort     — (field) => void
 *   align      — 'left' (default) | 'right' | 'center'
 *   width      — fixed pixel width (optional)
 *   className, style — passthrough
 */
export function SortableTh({ field, label, sortField, sortDir, onSort, align = undefined, width = undefined, className = "", style = undefined }) {
    const active = sortField === field;
    const icon = active
        ? `fa-sort-${sortDir === "asc" ? "up" : "down"}`
        : "fa-sort";
    return (
        <th
            className={className}
            style={{
                cursor: "pointer",
                userSelect: "none",
                whiteSpace: "nowrap",
                textAlign: align,
                width,
                ...style,
            }}
            onClick={() => onSort(field)}
        >
            {label}
            <i className={`fas ${icon} ms-1`} style={!active ? { opacity: 0.3 } : undefined} />
        </th>
    );
}

// Simple Pagination Component
export function TablePagination1({ count, page, rowsPerPage, onPageChange, onRowsPerPageChange, rowsPerPageOptions }) {
    const totalPages = Math.ceil(count / rowsPerPage);
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px" }}>
            <span>
                Rows per page:{" "}
                <select value={rowsPerPage} onChange={onRowsPerPageChange}>
                    {rowsPerPageOptions.map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            </span>
            <span>
                {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, count)} of {count}
            </span>
            <span>
                <button onClick={() => onPageChange(null, Math.max(0, page - 1))} disabled={page === 0}>
                    {"<"}
                </button>
                <button onClick={() => onPageChange(null, Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>
                    {">"}
                </button>
            </span>
        </div>
    );
}

export function TablePagination({
    count,
    page,
    rowsPerPage,
    onPageChange,
    onRowsPerPageChange,
    rowsPerPageOptions
}) {
    const totalPages = Math.ceil(count / rowsPerPage);
    const [inputPage, setInputPage] = useState(page + 1); // user-facing is 1-based

    // 🔄 Keep inputPage in sync when page changes externally
    useEffect(() => {
        setInputPage(page + 1);
    }, [page]);

    const handleJump = (e) => {
        e.preventDefault();
        const targetPage = Number(inputPage) - 1;
        if (!isNaN(targetPage) && targetPage >= 0 && targetPage < totalPages) {
            onPageChange(null, targetPage);
        } else {
            // Reset to current page if invalid
            setInputPage(page + 1);
        }
    };

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px",
                gap: "12px"
            }}
        >
            <span>
                Rows per page:{" "}
                <select value={rowsPerPage} onChange={onRowsPerPageChange}>
                    {rowsPerPageOptions.map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            </span>

            <span>
                {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, count)} of{" "}
                {count}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                    onClick={() => onPageChange(null, Math.max(0, page - 1))}
                    disabled={page === 0}
                >
                    {"< Prev"}
                </button>

                <form
                    onSubmit={handleJump}
                    style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                    <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={inputPage}
                        onChange={(e) => setInputPage(e.target.value)}
                        style={{ width: "50px", textAlign: "center" }}
                    />
                    <span>/ {totalPages}</span>
                </form>

                <button
                    onClick={() =>
                        onPageChange(null, Math.min(totalPages - 1, page + 1))
                    }
                    disabled={page >= totalPages - 1}
                >
                    {"Next >"}
                </button>
            </div>
        </div>
    );
}

// Simple Loader
export function CircularProgress({ size }) {
    return (
        <div style={{ display: "inline-block", width: size, height: size }}>
            <svg viewBox="0 0 50 50" style={{ width: size, height: size }}>
                <circle
                    cx="25"
                    cy="25"
                    r="20"
                    fill="none"
                    stroke="#1976d2"
                    strokeWidth="5"
                    strokeDasharray="90"
                    strokeDashoffset="60"
                >
                    <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 25 25"
                        to="360 25 25"
                        dur="1s"
                        repeatCount="indefinite" />
                </circle>
            </svg>
        </div>
    );
}
