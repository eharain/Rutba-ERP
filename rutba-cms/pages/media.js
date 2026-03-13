import { useState, useEffect, useCallback, useRef } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl, isImage, isPDF } from "@rutba/pos-shared/lib/api";
import { useToast } from "../components/Toast";

const PAGE_SIZE = 30;

function formatBytes(kb) {
    if (!kb && kb !== 0) return '';
    if (kb < 1) return `${Math.round(kb * 1024)} B`;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

export default function MediaPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [sortField, setSortField] = useState('createdAt');
    const [sortOrder, setSortOrder] = useState('desc');
    const [mimeFilter, setMimeFilter] = useState('all');
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [editingMeta, setEditingMeta] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const fileInputRef = useRef();

    const loadFiles = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                sort: [`${sortField}:${sortOrder}`],
                pagination: { page, pageSize: PAGE_SIZE },
            };

            const filters = {};

            if (search.trim()) {
                filters.$or = [
                    { name: { $containsi: search.trim() } },
                    { alternativeText: { $containsi: search.trim() } },
                    { caption: { $containsi: search.trim() } },
                ];
            }

            if (mimeFilter === 'image') {
                filters.mime = { $startsWith: 'image/' };
            } else if (mimeFilter === 'pdf') {
                filters.mime = { $eq: 'application/pdf' };
            } else if (mimeFilter === 'other') {
                filters.mime = { $notStartsWith: 'image/', $ne: 'application/pdf' };
            }

            if (Object.keys(filters).length > 0) {
                params.filters = filters;
            }

            const res = await authApi.fetchWithPagination('/upload/files', params);
            setFiles(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount || 1);
            setTotalCount(res.meta?.pagination?.total || 0);
        } catch (err) {
            console.error('Failed to load media files', err);
            toast('Failed to load media files.', 'danger');
        } finally {
            setLoading(false);
        }
    }, [jwt, search, page, sortField, sortOrder, mimeFilter]);

    useEffect(() => { loadFiles(); }, [loadFiles]);
    useEffect(() => { setPage(1); }, [search, mimeFilter]);

    const handleUpload = async (e) => {
        const newFiles = Array.from(e.target.files || []);
        if (newFiles.length === 0) return;
        setUploading(true);
        try {
            await authApi.uploadFile(newFiles, null, null, null, {
                name: null, alt: null, caption: null,
            });
            toast(`Uploaded ${newFiles.length} file(s).`, 'success');
            await loadFiles();
        } catch (err) {
            console.error('Upload failed', err);
            toast('Upload failed.', 'danger');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (fileId) => {
        if (!confirm('Permanently delete this file? It will be removed from all entries that reference it.')) return;
        setDeleting(fileId);
        try {
            await authApi.deleteFile(fileId);
            setFiles(prev => prev.filter(f => f.id !== fileId));
            if (selectedFile?.id === fileId) setSelectedFile(null);
            toast('File deleted.', 'success');
        } catch (err) {
            console.error('Failed to delete file', err);
            toast('Failed to delete file.', 'danger');
        } finally {
            setDeleting(null);
        }
    };

    const handleUpdateMeta = async () => {
        if (!editingMeta) return;
        try {
            // Strapi v5 update file info via PUT /upload?id=...
            // We'll use a form-data approach
            const form = new FormData();
            form.append('fileInfo', JSON.stringify({
                name: editingMeta.name,
                alternativeText: editingMeta.alternativeText,
                caption: editingMeta.caption,
            }));
            // authApi doesn't have a direct method for this, so use the file's existing data
            // For now we simply close the panel – full meta update requires Strapi admin API
            setSelectedFile({ ...selectedFile, ...editingMeta });
            setEditingMeta(null);
            toast('Metadata updated locally.', 'info');
        } catch (err) {
            console.error('Failed to update metadata', err);
        }
    };

    const copyUrl = (file) => {
        const url = StraipImageUrl(file);
        navigator.clipboard.writeText(url).then(() => {
            toast('URL copied to clipboard.', 'success');
        }).catch(() => {
            toast('Failed to copy URL.', 'danger');
        });
    };

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <h2 className="mb-0">
                        <i className="fas fa-photo-video me-2" />
                        Media Library
                    </h2>
                    <span className="badge bg-secondary ms-2 align-self-center">{totalCount} files</span>
                </div>

                {/* Toolbar */}
                <div className="card mb-3">
                    <div className="card-body py-2">
                        <div className="d-flex flex-wrap align-items-center gap-2">
                            {/* Search */}
                            <div className="flex-grow-1" style={{ minWidth: 200, maxWidth: 400 }}>
                                <div className="input-group input-group-sm">
                                    <span className="input-group-text"><i className="fas fa-search" /></span>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Search by name, alt text, or caption…"
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

                            {/* Mime filter */}
                            <select
                                className="form-select form-select-sm"
                                style={{ width: 'auto' }}
                                value={mimeFilter}
                                onChange={e => setMimeFilter(e.target.value)}
                            >
                                <option value="all">All types</option>
                                <option value="image">Images</option>
                                <option value="pdf">PDFs</option>
                                <option value="other">Other</option>
                            </select>

                            {/* Sort */}
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

                            {/* View toggle */}
                            <div className="btn-group btn-group-sm">
                                <button
                                    className={`btn ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                    onClick={() => setViewMode('grid')}
                                    title="Grid view"
                                >
                                    <i className="fas fa-th" />
                                </button>
                                <button
                                    className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                    onClick={() => setViewMode('list')}
                                    title="List view"
                                >
                                    <i className="fas fa-list" />
                                </button>
                            </div>

                            {/* Upload */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,application/pdf"
                                multiple
                                className="d-none"
                                onChange={handleUpload}
                            />
                            <button
                                className="btn btn-sm btn-primary"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                            >
                                <i className="fas fa-cloud-upload-alt me-1" />
                                {uploading ? 'Uploading…' : 'Upload Files'}
                            </button>

                            {/* Refresh */}
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
                </div>

                <div className="row">
                    {/* Main content */}
                    <div className={selectedFile ? 'col-md-8 col-lg-9' : 'col-12'}>
                        {loading && files.length === 0 && (
                            <div className="text-center py-5">
                                <div className="spinner-border text-primary" />
                                <p className="mt-2 text-muted">Loading media…</p>
                            </div>
                        )}

                        {!loading && files.length === 0 && (
                            <div className="text-center py-5 text-muted">
                                <i className="fas fa-photo-video fa-3x mb-3 d-block" />
                                <p>{search || mimeFilter !== 'all' ? 'No files match your filters.' : 'No files in the media library yet.'}</p>
                                <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                                    <i className="fas fa-cloud-upload-alt me-1" /> Upload your first file
                                </button>
                            </div>
                        )}

                        {/* Grid view */}
                        {viewMode === 'grid' && files.length > 0 && (
                            <div className="row g-3">
                                {files.map(file => {
                                    const thumb = file.formats?.thumbnail || file.formats?.small || file;
                                    const src = StraipImageUrl(thumb);
                                    const fileIsImage = isImage(file);
                                    const fileIsPdf = isPDF(file);
                                    const isActive = selectedFile?.id === file.id;

                                    return (
                                        <div key={file.id} className="col-6 col-sm-4 col-md-3 col-lg-2">
                                            <div
                                                className={`card h-100 ${isActive ? 'border-primary border-2 shadow' : ''}`}
                                                style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                                                onClick={() => setSelectedFile(isActive ? null : file)}
                                            >
                                                <div className="d-flex align-items-center justify-content-center bg-light" style={{ height: 120, overflow: 'hidden' }}>
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
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* List view */}
                        {viewMode === 'list' && files.length > 0 && (
                            <div className="table-responsive">
                                <table className="table table-hover table-sm align-middle">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 60 }}></th>
                                            <th>Name</th>
                                            <th>Type</th>
                                            <th>Size</th>
                                            <th>Dimensions</th>
                                            <th>Uploaded</th>
                                            <th style={{ width: 120 }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {files.map(file => {
                                            const thumb = file.formats?.thumbnail || file;
                                            const src = StraipImageUrl(thumb);
                                            const fileIsImage = isImage(file);
                                            const isActive = selectedFile?.id === file.id;

                                            return (
                                                <tr
                                                    key={file.id}
                                                    className={isActive ? 'table-primary' : ''}
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => setSelectedFile(isActive ? null : file)}
                                                >
                                                    <td>
                                                        {fileIsImage ? (
                                                            <img src={src} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                                                        ) : (
                                                            <i className={`fas ${isPDF(file) ? 'fa-file-pdf text-danger' : 'fa-file text-secondary'} fa-lg`} />
                                                        )}
                                                    </td>
                                                    <td className="text-truncate" style={{ maxWidth: 250 }} title={file.name}>{file.name}</td>
                                                    <td><span className="badge bg-light text-dark">{file.ext}</span></td>
                                                    <td>{formatBytes(file.size)}</td>
                                                    <td>{file.width && file.height ? `${file.width}×${file.height}` : '—'}</td>
                                                    <td>{new Date(file.createdAt).toLocaleDateString()}</td>
                                                    <td>
                                                        <button
                                                            className="btn btn-sm btn-outline-secondary me-1"
                                                            title="Copy URL"
                                                            onClick={(e) => { e.stopPropagation(); copyUrl(file); }}
                                                        >
                                                            <i className="fas fa-link" />
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-outline-danger"
                                                            title="Delete"
                                                            disabled={deleting === file.id}
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }}
                                                        >
                                                            <i className="fas fa-trash" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

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

                    {/* Detail sidebar */}
                    {selectedFile && (
                        <div className="col-md-4 col-lg-3">
                            <div className="card position-sticky" style={{ top: 80 }}>
                                <div className="card-header d-flex align-items-center">
                                    <strong className="flex-grow-1 text-truncate">{selectedFile.name}</strong>
                                    <button className="btn-close btn-sm" onClick={() => setSelectedFile(null)} />
                                </div>
                                <div className="card-body">
                                    {/* Preview */}
                                    <div className="text-center mb-3 bg-light p-2 rounded" style={{ maxHeight: 250, overflow: 'hidden' }}>
                                        {isImage(selectedFile) ? (
                                            <img
                                                src={StraipImageUrl(selectedFile)}
                                                alt={selectedFile.alternativeText || selectedFile.name}
                                                style={{ maxWidth: '100%', maxHeight: 230, objectFit: 'contain' }}
                                            />
                                        ) : isPDF(selectedFile) ? (
                                            <i className="fas fa-file-pdf fa-5x text-danger my-4" />
                                        ) : (
                                            <i className="fas fa-file fa-5x text-secondary my-4" />
                                        )}
                                    </div>

                                    {/* Meta info */}
                                    <table className="table table-sm small mb-3">
                                        <tbody>
                                            <tr><td className="text-muted">File name</td><td className="text-break">{selectedFile.name}</td></tr>
                                            <tr><td className="text-muted">Type</td><td>{selectedFile.mime}</td></tr>
                                            <tr><td className="text-muted">Extension</td><td>{selectedFile.ext}</td></tr>
                                            <tr><td className="text-muted">Size</td><td>{formatBytes(selectedFile.size)}</td></tr>
                                            {selectedFile.width && selectedFile.height && (
                                                <tr><td className="text-muted">Dimensions</td><td>{selectedFile.width} × {selectedFile.height}</td></tr>
                                            )}
                                            <tr><td className="text-muted">Uploaded</td><td>{new Date(selectedFile.createdAt).toLocaleString()}</td></tr>
                                            {selectedFile.alternativeText && (
                                                <tr><td className="text-muted">Alt text</td><td>{selectedFile.alternativeText}</td></tr>
                                            )}
                                            {selectedFile.caption && (
                                                <tr><td className="text-muted">Caption</td><td>{selectedFile.caption}</td></tr>
                                            )}
                                        </tbody>
                                    </table>

                                    {/* Available formats */}
                                    {selectedFile.formats && (
                                        <div className="mb-3">
                                            <p className="small fw-bold mb-1">Available formats:</p>
                                            <div className="d-flex flex-wrap gap-1">
                                                {Object.entries(selectedFile.formats).map(([key, fmt]) => (
                                                    <span key={key} className="badge bg-light text-dark border" title={`${fmt.width}×${fmt.height}`}>
                                                        {key} ({fmt.width}×{fmt.height})
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="d-flex flex-wrap gap-2">
                                        <button
                                            className="btn btn-sm btn-outline-secondary flex-grow-1"
                                            onClick={() => copyUrl(selectedFile)}
                                        >
                                            <i className="fas fa-link me-1" /> Copy URL
                                        </button>
                                        <a
                                            className="btn btn-sm btn-outline-primary flex-grow-1"
                                            href={StraipImageUrl(selectedFile)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <i className="fas fa-external-link-alt me-1" /> Open
                                        </a>
                                        <button
                                            className="btn btn-sm btn-outline-danger flex-grow-1"
                                            onClick={() => handleDelete(selectedFile.id)}
                                            disabled={deleting === selectedFile.id}
                                        >
                                            <i className="fas fa-trash me-1" /> Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
