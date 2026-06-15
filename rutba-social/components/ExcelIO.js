import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import PermissionCheck from '@rutba/pos-shared/components/PermissionCheck';
import { CmsBulkEndpoints } from '@rutba/api-provider/endpoints';

// Drop-in Excel Export/Import controls for a list page. Mirrors
// rutba-cms/components/ExcelIO.js — the server side (cms-bulk controller) is a
// generic, allowlist-gated upsert, so the same component drives bulk editing
// for any whitelisted content type (here: api::social-post.social-post).
//
// Identity columns are always emitted first and always accepted on import.
// Import upsert order (server-side):
//   1. row has `documentId` → update that document
//   2. caller's natural key matches → update it (posts: no natural key → skip)
//   3. otherwise create
// `publish` is a per-row directive: true → CMS-publish after upsert, false →
// leave as draft. (For social posts this is the CMS draft/published flag, not a
// push to the platforms — that stays an explicit action in the UI.)
const IDENTITY_HEADERS = ['documentId', 'id', 'contentType', 'publish'];

// Chunk size for the bulk-import POST. The server caps at 50; 5 keeps each
// request short so the progress bar moves and a bad chunk taints few rows.
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
    const sheetIndex = wb.SheetNames.indexOf(META_SHEET);
    if (sheetIndex >= 0) {
        wb.Workbook.Sheets[sheetIndex] = { Hidden: 1 };
    }

    const slug = String(entityLabel || 'export').toLowerCase().replace(/\s+/g, '-');
    XLSX.writeFile(wb, `${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

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
 * ExcelIO — Export/Import controls for a list page. Admin-only (PermissionCheck
 * showIf="admin"; the cms-bulk endpoint also requires an *_admin active role).
 *
 * Props: entityLabel, contentType (Strapi UID), columns
 *   [{ key, header?, width?, format?(row), parse?(value,row), readOnly? }],
 *   rows, selectedIds?, total?, fetchAll?(), onAfterImport?(), disabled?.
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
        if (!contentType) {
            setLog([{ type: 'danger', text: 'This list has no contentType configured — bulk import is disabled.' }]);
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

            const fileContentType = readContentTypeFromWorkbook(wb);
            if (fileContentType && fileContentType !== contentType) {
                setLog([{ type: 'danger', text: `Wrong file. This Excel was exported for "${fileContentType}", but this list is "${contentType}". Import aborted.` }]);
                return;
            }

            const dataSheetName = wb.SheetNames.find((n) => n !== META_SHEET) || wb.SheetNames[0];
            const ws = wb.Sheets[dataSheetName];
            const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (!raw || raw.length === 0) {
                setLog([{ type: 'warning', text: 'No rows found in the sheet.' }]);
                return;
            }

            const mismatched = [];
            for (let i = 0; i < raw.length; i++) {
                const cell = raw[i]?.contentType;
                if (cell === undefined || cell === null || String(cell).trim() === '') continue;
                if (String(cell).trim() !== contentType) {
                    mismatched.push({ row: i + 2, found: String(cell).trim() });
                }
            }
            if (mismatched.length > 0) {
                const sample = mismatched.slice(0, 3).map((m) => `row ${m.row} ("${m.found}")`).join(', ');
                const more = mismatched.length > 3 ? ` (+${mismatched.length - 3} more)` : '';
                setLog([{ type: 'danger', text: `Content-type mismatch. ${mismatched.length} row(s) declare a different contentType than this list ("${contentType}"): ${sample}${more}. Import aborted.` }]);
                return;
            }

            const items = raw.map((rawRow) => parseSheetRow(rawRow, columns));
            const rowCount = items.length;
            const counts = { done: 0, total: rowCount, created: 0, updated: 0, published: 0, failed: 0 };
            setProgress({ ...counts });
            const lines = [];
            const startedAt = Date.now();

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
                        lines.push({ type: 'danger', text: `Failed: ${f.label || `row ${start + (f.index ?? 0) + 1}`} – ${f.message || 'Unknown error'}` });
                    }
                } catch (err) {
                    const detail = err?.response?.data?.error?.message || err.message || 'Unknown error';
                    counts.failed += chunk.length;
                    lines.push({ type: 'danger', text: `Chunk ${start + 1}-${start + chunk.length} failed: ${detail}` });
                }
                counts.done = Math.min(start + chunk.length, rowCount);
                counts.elapsedMs = Date.now() - startedAt;
                setProgress({ ...counts });
            }

            if (lines.length === 0) {
                lines.push({ type: 'success', text: `Imported ${counts.created + counts.updated} row(s): ${counts.created} created, ${counts.updated} updated${counts.published ? `, ${counts.published} published` : ''}.` });
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
            <div ref={rootRef} className="d-inline-flex gap-2 align-items-center position-relative">
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
                        <ul className="dropdown-menu show" style={{ position: 'absolute', top: '100%', right: 0, display: 'block', zIndex: 1050, minWidth: 200 }}>
                            <li>
                                <button className="dropdown-item" onClick={() => doExport('page')}>Current page ({rows.length})</button>
                            </li>
                            {selRows.length > 0 && (
                                <li>
                                    <button className="dropdown-item" onClick={() => doExport('selected')}>Selected ({selRows.length})</button>
                                </li>
                            )}
                            {fetchAll && (
                                <li>
                                    <button className="dropdown-item" onClick={() => doExport('all')}>All{total ? ` (${total})` : ''}</button>
                                </li>
                            )}
                        </ul>
                    )}
                </div>
                <label className={`btn btn-outline-info btn-sm mb-0${disabled || busy ? ' disabled' : ''}`} title="Import from Excel">
                    <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-upload'} me-1`}></i>
                    {busy
                        ? progress
                            ? `Working ${progress.done}/${progress.total}${progress.failed ? ` · ${progress.failed} failed` : ''}`
                            : 'Working…'
                        : 'Import'}
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="d-none" disabled={disabled || busy} onChange={onPickFile} />
                </label>
                {busy && progress && progress.total > 0 && (
                    <div className="position-absolute" style={{ top: '100%', right: 0, marginTop: 6, width: 280, background: '#fff', border: '1px solid #dee2e6', borderRadius: 4, padding: 8, zIndex: 1049, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                        <div className="small text-muted mb-1">
                            <strong>{progress.done}</strong> of <strong>{progress.total}</strong>
                            {progress.elapsedMs ? <span className="ms-2">· {Math.round(progress.elapsedMs / 1000)}s</span> : null}
                        </div>
                        <div className="progress" style={{ height: 6 }}>
                            <div className="progress-bar bg-info" role="progressbar" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                        </div>
                        <div className="small text-muted mt-1 d-flex gap-2">
                            <span>Created: <strong>{progress.created}</strong></span>
                            <span>Updated: <strong>{progress.updated}</strong></span>
                            {progress.failed > 0 && <span className="text-danger">Failed: <strong>{progress.failed}</strong></span>}
                        </div>
                    </div>
                )}
                {log.length > 0 && logOpen && (
                    <div className="position-absolute" style={{ top: '100%', right: 0, marginTop: 6, width: 360, maxHeight: 320, overflow: 'auto', background: '#fff', border: '1px solid #dee2e6', borderRadius: 4, padding: 8, zIndex: 1050, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                        <div className="d-flex justify-content-between align-items-center mb-1">
                            <strong>Import results ({log.length})</strong>
                            <button type="button" className="btn-close" aria-label="Close" onClick={() => setLogOpen(false)} />
                        </div>
                        {log.map((l, i) => (
                            <div key={i} className={`alert alert-${l.type} py-1 px-2 mb-1 small`}>{l.text}</div>
                        ))}
                    </div>
                )}
            </div>
        </PermissionCheck>
    );
}
