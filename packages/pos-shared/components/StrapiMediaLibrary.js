import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authApi, StraipImageUrl, isImage, isPDF } from '../lib/api';

/**
 * StrapiMediaLibrary – a modal component that browses / searches the Strapi
 * upload library and lets the user pick one or more existing files.
 *
 * Props:
 *   show        – boolean – controls visibility
 *   onClose     – () => void
 *   onSelect    – (files: object[]) => void – called with selected file(s)
 *   multiple    – boolean – allow multi-select (default false)
 *   accept      – "image" | "file" | "all" – filter by mime prefix (default "all")
 */
export default function StrapiMediaLibrary({
    show = false,
    onClose,
    onSelect,
    multiple = false,
    accept = 'all',
}) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const [selected, setSelected] = useState(new Set());
    const [sortField, setSortField] = useState('createdAt');
    const [sortOrder, setSortOrder] = useState('desc');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef();
    const PAGE_SIZE = 24;

    const loadFiles = useCallback(async () => {
        if (!show) return;
        setLoading(true);
        try {
            const params = {
                sort: [`${sortField}:${sortOrder}`],
                pagination: { page, pageSize: PAGE_SIZE },
            };

            if (search.trim()) {
                params.filters = {
                    $or: [
                        { name: { $containsi: search.trim() } },
                        { alternativeText: { $containsi: search.trim() } },
                        { caption: { $containsi: search.trim() } },
                    ],
                };
            }

            if (accept === 'image') {
                params.filters = {
                    ...params.filters,
                    mime: { $startsWith: 'image/' },
                };
            }

            const res = await authApi.fetchWithPagination('/upload/files', params);
            setFiles(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount || 1);
        } catch (err) {
            console.error('Failed to load media library', err);
        } finally {
            setLoading(false);
        }
    }, [show, search, page, sortField, sortOrder, accept]);

    useEffect(() => { loadFiles(); }, [loadFiles]);

    useEffect(() => {
        if (show) {
            setSelected(new Set());
        }
    }, [show]);

    // Reset to page 1 when search changes
    useEffect(() => { setPage(1); }, [search]);

    const toggleSelect = (fileId) => {
        setSelected(prev => {
            const s = new Set(prev);
            if (s.has(fileId)) {
                s.delete(fileId);
            } else {
                if (!multiple) s.clear();
                s.add(fileId);
            }
            return s;
        });
    };

    const handleConfirm = () => {
        const picked = files.filter(f => selected.has(f.id));
        if (picked.length === 0) return;
        onSelect(picked);
        onClose();
    };

    const handleUpload = async (e) => {
        const newFiles = Array.from(e.target.files || []);
        if (newFiles.length === 0) return;
        setUploading(true);
        try {
            await authApi.uploadFile(newFiles, null, null, null, {
                name: null, alt: null, caption: null,
            });
            await loadFiles();
        } catch (err) {
            console.error('Upload failed', err);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (fileId) => {
        if (!confirm('Delete this file permanently from the media library?')) return;
        try {
            await authApi.deleteFile(fileId);
            setFiles(prev => prev.filter(f => f.id !== fileId));
            setSelected(prev => { const s = new Set(prev); s.delete(fileId); return s; });
        } catch (err) {
            console.error('Failed to delete file', err);
        }
    };

    if (!show) return null;

    return (
        <div className="modal d-block" tabIndex={-1} style={{ background: 'rgba(0,0,0,0.5)', zIndex: 9999 }}>
            <div className="modal-dialog modal-xl modal-dialog-scrollable">
                <div className="modal-content" style={{ minHeight: '80vh' }}>
                    {/* Header */}
                    <div className="modal-header">
                        <h5 className="modal-title">
                            <i className="fas fa-photo-video me-2" />
                            Media Library
                        </h5>
                        <button type="button" className="btn-close" onClick={onClose} />
                    </div>

                    {/* Toolbar */}
                    <div className="px-3 pt-3 pb-2 border-bottom bg-light">
                        <div className="d-flex flex-wrap align-items-center gap-2">
                            <div className="flex-grow-1">
                                <div className="input-group input-group-sm">
                                    <span className="input-group-text"><i className="fas fa-search" /></span>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Search files by name…"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                    {search && (
                                        <button className="btn btn-outline-secondary" type="button" onClick={() => setSearch('')}>
                                            <i className="fas fa-times" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <select
                                className="form-select form-select-sm"
                                style={{ width: 'auto' }}
                                value={`${sortField}:${sortOrder}`}
                                onChange={e => {
                                    const [f, o] = e.target.value.split(':');
                                    setSortField(f);
                                    setSortOrder(o);
                                }}
                            >
                                <option value="createdAt:desc">Newest first</option>
                                <option value="createdAt:asc">Oldest first</option>
                                <option value="name:asc">Name A–Z</option>
                                <option value="name:desc">Name Z–A</option>
                                <option value="size:desc">Largest first</option>
                                <option value="size:asc">Smallest first</option>
                            </select>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,application/pdf"
                                multiple
                                className="d-none"
                                onChange={handleUpload}
                            />
                            <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                            >
                                <i className="fas fa-cloud-upload-alt me-1" />
                                {uploading ? 'Uploading…' : 'Upload'}
                            </button>

                            <button
                                className="btn btn-sm btn-outline-secondary"
                                onClick={loadFiles}
                                disabled={loading}
                                title="Refresh"
                            >
                                <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="modal-body" style={{ overflowY: 'auto' }}>
                        {loading && files.length === 0 && (
                            <div className="text-center py-5">
                                <div className="spinner-border text-primary" />
                                <p className="mt-2 text-muted">Loading media…</p>
                            </div>
                        )}

                        {!loading && files.length === 0 && (
                            <div className="text-center py-5 text-muted">
                                <i className="fas fa-photo-video fa-3x mb-3 d-block" />
                                {search ? 'No files match your search.' : 'No files in the media library.'}
                            </div>
                        )}

                        <div className="row g-3">
                            {files.map(file => {
                                const isSelected = selected.has(file.id);
                                const thumb = file.formats?.thumbnail || file.formats?.small || file;
                                const src = StraipImageUrl(thumb);
                                const fileIsImage = isImage(file);
                                const fileIsPdf = isPDF(file);

                                return (
                                    <div key={file.id} className="col-6 col-sm-4 col-md-3 col-lg-2">
                                        <div
                                            className={`card h-100 ${isSelected ? 'border-primary border-2 shadow' : ''}`}
                                            style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                                            onClick={() => toggleSelect(file.id)}
                                        >
                                            <div className="d-flex align-items-center justify-content-center bg-light" style={{ height: 120, overflow: 'hidden', position: 'relative' }}>
                                                {isSelected && (
                                                    <div className="position-absolute top-0 start-0 m-1" style={{ zIndex: 2 }}>
                                                        <span className="badge bg-primary"><i className="fas fa-check" /></span>
                                                    </div>
                                                )}
                                                {fileIsImage ? (
                                                    <img
                                                        src={src}
                                                        alt={file.alternativeText || file.name}
                                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                                    />
                                                ) : fileIsPdf ? (
                                                    <i className="fas fa-file-pdf fa-3x text-danger" />
                                                ) : (
                                                    <i className="fas fa-file fa-3x text-secondary" />
                                                )}
                                            </div>
                                            <div className="card-body p-2">
                                                <p className="mb-0 small text-truncate" title={file.name}>{file.name}</p>
                                                <p className="mb-0 text-muted" style={{ fontSize: '0.7rem' }}>
                                                    {file.ext} · {formatBytes(file.size)}
                                                    {file.width && file.height && ` · ${file.width}×${file.height}`}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        {pageCount > 1 && (
                            <nav className="mt-4 d-flex justify-content-center">
                                <ul className="pagination pagination-sm mb-0">
                                    <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}>
                                        <button className="page-link" onClick={() => setPage(p => Math.max(1, p - 1))}>&laquo;</button>
                                    </li>
                                    {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
                                        let p;
                                        if (pageCount <= 7) {
                                            p = i + 1;
                                        } else if (page <= 4) {
                                            p = i + 1;
                                        } else if (page >= pageCount - 3) {
                                            p = pageCount - 6 + i;
                                        } else {
                                            p = page - 3 + i;
                                        }
                                        return (
                                            <li key={p} className={`page-item ${p === page ? 'active' : ''}`}>
                                                <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                                            </li>
                                        );
                                    })}
                                    <li className={`page-item ${page >= pageCount ? 'disabled' : ''}`}>
                                        <button className="page-link" onClick={() => setPage(p => Math.min(pageCount, p + 1))}>&raquo;</button>
                                    </li>
                                </ul>
                            </nav>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="modal-footer">
                        <span className="me-auto text-muted small">
                            {selected.size > 0 ? `${selected.size} file(s) selected` : 'Select a file to attach'}
                        </span>
                        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
                        <button
                            className="btn btn-primary btn-sm"
                            disabled={selected.size === 0}
                            onClick={handleConfirm}
                        >
                            <i className="fas fa-check me-1" />
                            {multiple ? 'Attach Selected' : 'Select'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatBytes(kb) {
    if (!kb && kb !== 0) return '';
    if (kb < 1) return `${Math.round(kb * 1024)} B`;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}
