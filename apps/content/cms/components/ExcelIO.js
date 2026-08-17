import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import PermissionCheck from '@rutba/pos-shared/components/PermissionCheck';
import { CmsBulkEndpoints } from '@rutba/api-provider/endpoints';

// Identity columns are always emitted first and always accepted on import.
// Import upsert order (server-side):
//   1. row has `documentId` → update that document
//   2. caller's natural key (slug/sku/name) matches → update it
//   3. otherwise create
// `publish` is a per-row directive (not a domain field): true → publish after
// upsert, false/empty → leave as draft.
// `contentType` is a per-row marker stamped on export with the list's
// Strapi UID (api::brand.brand etc.). On import it acts as a guard — any row
// whose contentType is present and doesn't match the destination list's
// contentType aborts the whole import. Missing column = legacy/hand-built
// sheet, allowed through.
const IDENTITY_HEADERS = ['documentId', 'id', 'contentType', 'publish'];

// Chunk size for the bulk-import POST. The server caps at 50 (see the
// cms-bulk controller's MAX_ROWS_PER_REQUEST); 5 keeps each request short
// enough that the progress bar moves visibly and a single bad chunk only
// taints 5 rows of reporting. Tunable: raise to ~20 if you've verified
// rows tend to upsert quickly (e.g., a list with no SEO sidecars).
const CHUNK_SIZE = 5;

function cellOut(row, col) {
    const raw = typeof col.format === 'function' ? col.format(row) : row?.[col.key];
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'object') {
        try { return JSON.stringify(raw); } catch { return ''; }
    }
    return raw;
}

function buildSheetRow(row, columns, contentType) {
    // The publish column reflects the row's current publish state on export
    // and acts as a directive on import. Pull from _isPublished (the list
    // pages already track this) or fall back to publishedAt presence.
    const publishState =
        row?._isPublished === true || row?._isPublished === false
            ? row._isPublished
            : !!row?.publishedAt;
    const out = {
        documentId: row?.documentId || '',
        id: row?.id ?? '',
        contentType: contentType || '',
        publish: publishState ? 'true' : 'false',
    };
    for (const col of columns) {
        if (IDENTITY_HEADERS.includes(col.key)) continue;
        out[col.header || col.key] = cellOut(row, col);
    }
    return out;
}

// Hidden metadata sheet: identifies which content type a workbook was exported
// from so the import side can refuse a mismatched file.
const META_SHEET = '_meta';
const META_CONTENT_TYPE_KEY = 'contentType';

function downloadWorkbook({ rows, columns, entityLabel, contentType }) {
    const data = rows.map((r) => buildSheetRow(r, columns, contentType));
    const headerOrder = [
        ...IDENTITY_HEADERS,
        ...columns.filter((c) => !IDENTITY_HEADERS.includes(c.key)).map((c) => c.header || c.key),
    ];
    const ws = XLSX.utils.json_to_sheet(data, { header: headerOrder });
    ws['!cols'] = headerOrder.map((h) => {
        const c = columns.find((col) => (col.header || col.key) === h);
        return { wch: c?.width || (h === 'documentId' ? 28 : h === 'id' ? 8 : 22) };
    });
    const wb = XLSX.utils.book_new();
    const sheetName = String(entityLabel || 'Data').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // _meta sheet: stable content-type identifier + export timestamp. Hidden
    // so it doesn't clutter the user's view but survives round-trip edits.
    const metaWs = XLSX.utils.aoa_to_sheet([
        [META_CONTENT_TYPE_KEY, String(contentType || entityLabel || '')],
        ['exportedAt', new Date().toISOString()],
    ]);
    XLSX.utils.book_append_sheet(wb, metaWs, META_SHEET);
    if (wb.Workbook) {
        wb.Workbook.Sheets = wb.Workbook.Sheets || [];
    } else {
        wb.Workbook = { Sheets: [] };
    }
    // Hide the meta sheet so reviewers don't accidentally edit it.
    const sheetIndex = wb.SheetNames.indexOf(META_SHEET);
    if (sheetIndex >= 0) {
        wb.Workbook.Sheets[sheetIndex] = { Hidden: 1 };
    }

    const slug = String(entityLabel || 'export').toLowerCase().replace(/\s+/g, '-');
    XLSX.writeFile(wb, `${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Returns the contentType recorded in the workbook's _meta sheet, or null if
// the file predates the marker (older exports).
function readContentTypeFromWorkbook(wb) {
    const sheet = wb.Sheets?.[META_SHEET];
    if (!sheet) return null;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    for (const row of rows) {
        if (Array.isArray(row) && row[0] === META_CONTENT_TYPE_KEY) {
            const v = String(row[1] || '').trim();
            return v || null;
        }
    }
    return null;
}

// Flatten a sheet row into a single object the bulk endpoint understands.
// Columns flagged target:'seo' still come through with their key; the server
// recognises them by name (meta_title / meta_description / keywords /
// noindex) and routes them to the seo-meta sidecar.
//
// `publish` and `documentId` pass through as-is — the server treats them as
// per-row directives. Read-only columns (e.g. `parent` on products) are
// stripped because they're display-only.
function parseSheetRow(rawRow, columns) {
    const item = {};

    const docIdRaw = rawRow.documentId;
    if (docIdRaw !== undefined && docIdRaw !== null && String(docIdRaw).trim() !== '') {
        item.documentId = String(docIdRaw).trim();
    }
    const publishRaw = rawRow.publish;
    if (publishRaw !== undefined && publishRaw !== null && publishRaw !== '') {
        item.publish = publishRaw;
    }

    for (const col of columns) {
        if (IDENTITY_HEADERS.includes(col.key)) continue;
        if (col.readOnly) continue;
        const header = col.header || col.key;
        const cell = rawRow[header] !== undefined ? rawRow[header] : rawRow[col.key];
        if (cell === '' || cell === null || cell === undefined) continue;
        const value = typeof col.parse === 'function' ? col.parse(cell, rawRow) : cell;
        if (value === undefined) continue;
        item[col.key] = value;
    }
    return item;
}

/**
 * ExcelIO — drop-in Export/Import controls for a list page.
 *
 * Hidden unless the user's active role is admin (PermissionCheck showIf="admin").
 *
 * Import path: parses the Excel, validates the content-type marker, then
 * POSTs the parsed rows in chunks to /api/cms-bulk/import. The server does
 * the upsert + SEO sidecar + publish step (see cms-bulk controller). The
 * client just chunks, posts, and aggregates results.
 *
 * Required props:
 *   entityLabel  — "Pages", "Brands", "Products" — sheet + filename
 *   columns      — array of column descriptors:
 *                    { key, header?, width?, format?(row), parse?(value, row),
 *                      isLabel?, readOnly?, target? }
 *                  Identity columns (documentId, id, contentType, publish) are
 *                  auto-emitted/consumed and don't need to be in this list.
 *                  Columns with target: 'seo' route to the seo-meta sidecar
 *                  on the server side. Columns with readOnly: true are
 *                  emitted on export but ignored on import (e.g. product
 *                  `parent`).
 *   rows         — rows currently visible on the page (for "Current page" export
 *                  and the basis for "Selected")
 *   contentType  — stable Strapi UID (e.g. "api::brand.brand"). Stamped into
 *                  the hidden _meta sheet and the visible `contentType`
 *                  column on every export, and validated on import: a file
 *                  exported for a different CT is refused outright. Required
 *                  — the bulk endpoint won't accept the import without it.
 *
 * Optional:
 *   selectedIds  — Set or array of documentIds checked in the list. Enables
 *                  the "Selected" export option.
 *   total        — total result count from the list query (shown in the
 *                  "All" menu item).
 *   fetchAll     — async () => row[]; enables "All" export. Omit to hide it.
 *   onAfterImport — () => void; refresh the list after import completes.
 *   disabled     — boolean; disables both buttons.
 */
export default function ExcelIO({
    entityLabel,
    contentType,
    columns,
    rows = [],
    selectedIds,
    total,
    fetchAll,
    onAfterImport,
    disabled,
}) {
    const [busy, setBusy] = useState(false);
    const [log, setLog] = useState([]);
    const [logOpen, setLogOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    // progress = null when idle; populated during an import so the button +
    // panel can show running counts. Refresh on every Nth row so React isn't
    // re-rendering 1300 times for a long import.
    const [progress, setProgress] = useState(null);
    const fileRef = useRef(null);
    const rootRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return undefined;
        const onClick = (e) => {
            if (!rootRef.current?.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [menuOpen]);

    const selSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
    const selRows = rows.filter((r) => selSet.has(r.documentId));

    const doExport = async (mode) => {
        setMenuOpen(false);
        let data = [];
        try {
            if (mode === 'page') data = rows;
            else if (mode === 'selected') data = selRows;
            else if (mode === 'all') {
                if (!fetchAll) return;
                setBusy(true);
                data = (await fetchAll()) || [];
            }
            if (!data || data.length === 0) return;
            downloadWorkbook({ rows: data, columns, entityLabel, contentType });
        } catch (err) {
            setLog([{ type: 'danger', text: `Export failed: ${err.message || err}` }]);
            setLogOpen(true);
        } finally {
            setBusy(false);
        }
    };

    const onPickFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Fail fast on misconfiguration BEFORE touching the file, so the
        // input keeps its picked value and the user sees the reason.
        if (!contentType) {
            setLog([
                {
                    type: 'danger',
                    text: 'This list has no contentType configured — bulk import is disabled.',
                },
            ]);
            setLogOpen(true);
            if (fileRef.current) fileRef.current.value = '';
            return;
        }
        setBusy(true);
        setLog([]);
        setLogOpen(true);
        try {
            const arrayBuffer = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = (ev) => res(ev.target.result);
                reader.onerror = () => rej(new Error('Failed to read file'));
                reader.readAsArrayBuffer(file);
            });
            const wb = XLSX.read(arrayBuffer, { type: 'array' });

            // Workbook-level guard: a previously-exported file carries its
            // source content type in the hidden _meta sheet. If it doesn't
            // match this list, refuse outright. Files without _meta
            // (legacy / hand-built) get through to the per-row check below.
            const fileContentType = readContentTypeFromWorkbook(wb);
            if (fileContentType && fileContentType !== contentType) {
                setLog([
                    {
                        type: 'danger',
                        text: `Wrong file. This Excel was exported for "${fileContentType}", but this list is "${contentType}". Import aborted.`,
                    },
                ]);
                return;
            }

            // Pick the first non-meta sheet for data so behaviour stays
            // stable if the user re-saves and sheet order shifts.
            const dataSheetName = wb.SheetNames.find((n) => n !== META_SHEET) || wb.SheetNames[0];
            const ws = wb.Sheets[dataSheetName];
            const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (!raw || raw.length === 0) {
                setLog([{ type: 'warning', text: 'No rows found in the sheet.' }]);
                return;
            }

            // Per-row contentType guard. Each exported row carries a
            // contentType cell stamped with the source list's Strapi UID.
            // Empty cell = legacy/hand-built row, allowed. Mismatched cell
            // = wrong file, abort the whole import.
            const mismatched = [];
            for (let i = 0; i < raw.length; i++) {
                const cell = raw[i]?.contentType;
                if (cell === undefined || cell === null || String(cell).trim() === '') continue;
                if (String(cell).trim() !== contentType) {
                    mismatched.push({ row: i + 2, found: String(cell).trim() });
                }
            }
            if (mismatched.length > 0) {
                const sample = mismatched.slice(0, 3)
                    .map((m) => `row ${m.row} ("${m.found}")`)
                    .join(', ');
                const more = mismatched.length > 3 ? ` (+${mismatched.length - 3} more)` : '';
                setLog([
                    {
                        type: 'danger',
                        text: `Content-type mismatch. ${mismatched.length} row(s) declare a different contentType than this list ("${contentType}"): ${sample}${more}. Import aborted.`,
                    },
                ]);
                return;
            }

            // Pre-parse every row in one pass so the network loop just
            // chunks and posts; the server applies the upsert + SEO +
            // publish logic. The per-row `contentType` cell is dropped here
            // — IDENTITY_HEADERS skips it inside parseSheetRow.
            const items = raw.map((rawRow) => parseSheetRow(rawRow, columns));
            const rowCount = items.length;
            const counts = {
                done: 0,
                total: rowCount,
                created: 0,
                updated: 0,
                published: 0,
                failed: 0,
            };
            setProgress({ ...counts });
            const lines = [];
            const startedAt = Date.now();

            // Chunk and POST sequentially. One chunk per request keeps the
            // server's per-request transaction small and lets the UI tick
            // forward between chunks (the slowest visible unit is a chunk,
            // not the whole file).
            for (let start = 0; start < rowCount; start += CHUNK_SIZE) {
                const chunk = items.slice(start, start + CHUNK_SIZE);
                try {
                    const res = await CmsBulkEndpoints.runImport(contentType, chunk);
                    const body = res?.data ?? res;
                    counts.created += body?.created || 0;
                    counts.updated += body?.updated || 0;
                    counts.published += body?.published || 0;
                    const chunkFailed = Array.isArray(body?.failed) ? body.failed : [];
                    counts.failed += chunkFailed.length;
                    for (const f of chunkFailed) {
                        lines.push({
                            type: 'danger',
                            text: `Failed: ${f.label || `row ${start + (f.index ?? 0) + 1}`} – ${f.message || 'Unknown error'}`,
                        });
                    }
                } catch (err) {
                    // Whole chunk rejected (auth, validation, network).
                    // Count every row in the chunk as failed so the totals
                    // stay honest.
                    const detail =
                        err?.response?.data?.error?.message || err.message || 'Unknown error';
                    counts.failed += chunk.length;
                    lines.push({
                        type: 'danger',
                        text: `Chunk ${start + 1}-${start + chunk.length} failed: ${detail}`,
                    });
                }
                counts.done = Math.min(start + chunk.length, rowCount);
                counts.elapsedMs = Date.now() - startedAt;
                setProgress({ ...counts });
            }

            if (lines.length === 0) {
                lines.push({
                    type: 'success',
                    text: `Imported ${counts.created + counts.updated} row(s): ${counts.created} created, ${counts.updated} updated${counts.published ? `, ${counts.published} published` : ''}.`,
                });
            }
            setLog(lines);
            onAfterImport?.();
        } catch (err) {
            setLog([{ type: 'danger', text: `Failed to parse: ${err.message || err}` }]);
        } finally {
            setBusy(false);
            setProgress(null);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <PermissionCheck showIf="admin">
            <div
                ref={rootRef}
                className="d-inline-flex gap-2 align-items-center position-relative"
            >
                <div className="position-relative">
                    <button
                        type="button"
                        className="btn btn-outline-success btn-sm"
                        disabled={disabled || busy || rows.length === 0}
                        onClick={() => setMenuOpen((s) => !s)}
                        title="Export to Excel"
                    >
                        <i className="fas fa-file-excel me-1"></i>Export
                        <i className="fas fa-caret-down ms-1"></i>
                    </button>
                    {menuOpen && (
                        <ul
                            className="dropdown-menu show"
                            style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                display: 'block',
                                zIndex: 1050,
                                minWidth: 200,
                            }}
                        >
                            <li>
                                <button className="dropdown-item" onClick={() => doExport('page')}>
                                    Current page ({rows.length})
                                </button>
                            </li>
                            {selRows.length > 0 && (
                                <li>
                                    <button
                                        className="dropdown-item"
                                        onClick={() => doExport('selected')}
                                    >
                                        Selected ({selRows.length})
                                    </button>
                                </li>
                            )}
                            {fetchAll && (
                                <li>
                                    <button
                                        className="dropdown-item"
                                        onClick={() => doExport('all')}
                                    >
                                        All{total ? ` (${total})` : ''}
                                    </button>
                                </li>
                            )}
                        </ul>
                    )}
                </div>
                <label
                    className={`btn btn-outline-info btn-sm mb-0${
                        disabled || busy ? ' disabled' : ''
                    }`}
                    title="Import from Excel"
                >
                    <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-upload'} me-1`}></i>
                    {busy
                        ? progress
                            ? `Working ${progress.done}/${progress.total}${progress.failed ? ` · ${progress.failed} failed` : ''}`
                            : 'Working…'
                        : 'Import'}
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="d-none"
                        disabled={disabled || busy}
                        onChange={onPickFile}
                    />
                </label>
                {busy && progress && progress.total > 0 && (
                    <div
                        className="position-absolute"
                        style={{
                            top: '100%',
                            right: 0,
                            marginTop: 6,
                            width: 280,
                            background: '#fff',
                            border: '1px solid #dee2e6',
                            borderRadius: 4,
                            padding: 8,
                            zIndex: 1049,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        }}
                    >
                        <div className="small text-muted mb-1">
                            <strong>{progress.done}</strong> of <strong>{progress.total}</strong>
                            {progress.elapsedMs ? (
                                <span className="ms-2">· {Math.round(progress.elapsedMs / 1000)}s</span>
                            ) : null}
                        </div>
                        <div className="progress" style={{ height: 6 }}>
                            <div
                                className="progress-bar bg-info"
                                role="progressbar"
                                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                            />
                        </div>
                        <div className="small text-muted mt-1 d-flex gap-2">
                            <span>Created: <strong>{progress.created}</strong></span>
                            <span>Updated: <strong>{progress.updated}</strong></span>
                            {progress.failed > 0 && (
                                <span className="text-danger">Failed: <strong>{progress.failed}</strong></span>
                            )}
                        </div>
                    </div>
                )}
                {log.length > 0 && logOpen && (
                    <div
                        className="position-absolute"
                        style={{
                            top: '100%',
                            right: 0,
                            marginTop: 6,
                            width: 360,
                            maxHeight: 320,
                            overflow: 'auto',
                            background: '#fff',
                            border: '1px solid #dee2e6',
                            borderRadius: 4,
                            padding: 8,
                            zIndex: 1050,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        }}
                    >
                        <div className="d-flex justify-content-between align-items-center mb-1">
                            <strong>Import results ({log.length})</strong>
                            <button
                                type="button"
                                className="btn-close"
                                aria-label="Close"
                                onClick={() => setLogOpen(false)}
                            />
                        </div>
                        {log.map((l, i) => (
                            <div
                                key={i}
                                className={`alert alert-${l.type} py-1 px-2 mb-1 small`}
                            >
                                {l.text}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </PermissionCheck>
    );
}
