import React, { useState, useEffect, useCallback, useRef } from "react";
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

    // Folder state
    const [folderTree, setFolderTree] = useState([]);
    const [currentFolderId, setCurrentFolderId] = useState('all');
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [renamingFolderId, setRenamingFolderId] = useState(null);
    const [renameValue, setRenameValue] = useState('');

    // File state
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
    const [deleting, setDeleting] = useState(null);
    const [viewMode, setViewMode] = useState('grid');
    const fileInputRef = useRef();

    // Drag & drop
    const [dragOverFolderId, setDragOverFolderId] = useState(null);
    const [draggedFileIds, setDraggedFileIds] = useState([]);
    const [selectedFileIds, setSelectedFileIds] = useState(new Set());

    // ─── Folders ────────────────────────────────────────────
    const loadFolders = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await authApi.get('/media-library/folders/tree');
            setFolderTree(res.data || []);
        } catch (err) {
            console.error('Failed to load folder tree', err);
        }
    }, [jwt]);

    useEffect(() => { loadFolders(); }, [loadFolders]);

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            const parentId = (currentFolderId && currentFolderId !== 'all' && currentFolderId !== 'root')
                ? Number(currentFolderId) : null;
            await authApi.post('/media-library/folders', { name: newFolderName.trim(), parent: parentId });
            setNewFolderName('');
            setCreatingFolder(false);
            toast('Folder created.', 'success');
            await loadFolders();
        } catch (err) {
            console.error('Failed to create folder', err);
            toast('Failed to create folder.', 'danger');
        }
    };

    const handleRenameFolder = async (folderId) => {
        if (!renameValue.trim()) return;
        try {
            await authApi.put('/media-library/folders/' + folderId, { name: renameValue.trim() });
            setRenamingFolderId(null);
            setRenameValue('');
            toast('Folder renamed.', 'success');
            await loadFolders();
        } catch (err) {
            console.error('Failed to rename folder', err);
            toast('Failed to rename folder.', 'danger');
        }
    };

    const handleDeleteFolder = async (folderId, e) => {
        e.stopPropagation();
        if (!confirm('Delete this folder? Files will be moved to the root.')) return;
        try {
            await authApi.del('/media-library/folders/' + folderId);
            if (String(currentFolderId) === String(folderId)) setCurrentFolderId('all');
            toast('Folder deleted.', 'success');
            await loadFolders();
            await loadFiles();
        } catch (err) {
            console.error('Failed to delete folder', err);
            toast('Failed to delete folder.', 'danger');
        }
    };

    const toggleExpand = (folderId) => {
        setExpandedFolders(prev => {
            const s = new Set(prev);
            if (s.has(folderId)) s.delete(folderId); else s.add(folderId);
            return s;
        });
    };

    // ─── Files ──────────────────────────────────────────────
    const loadFiles = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                sort: `${sortField}:${sortOrder}`,
                page,
                pageSize: PAGE_SIZE,
            };
            if (currentFolderId && currentFolderId !== 'all') {
                params.folder = currentFolderId;
            }
            if (search.trim()) {
                params.search = search.trim();
            }
            if (mimeFilter === 'image') {
                params.mime = 'image';
            } else if (mimeFilter === 'pdf') {
                params.mime = 'pdf';
            } else if (mimeFilter === 'other') {
                params.mime = 'other';
            }

            const res = await authApi.get('/media-library/files', params);
            setFiles(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount || 1);
            setTotalCount(res.meta?.pagination?.total || 0);
        } catch (err) {
            console.error('Failed to load media files', err);
            toast('Failed to load media files.', 'danger');
        } finally {
            setLoading(false);
        }
    }, [jwt, search, page, sortField, sortOrder, mimeFilter, currentFolderId]);

    useEffect(() => { loadFiles(); }, [loadFiles]);
    useEffect(() => { setPage(1); }, [search, mimeFilter, currentFolderId]);

    const handleUpload = async (e) => {
        const newFiles = Array.from(e.target.files || []);
        if (newFiles.length === 0) return;
        setUploading(true);
        try {
            const folderId = (currentFolderId && currentFolderId !== 'all' && currentFolderId !== 'root')
                ? currentFolderId : null;
            const uploaded = await authApi.uploadFile(newFiles, null, null, null, {
                name: null, alt: null, caption: null,
            });
            if (folderId && uploaded) {
                const ids = (Array.isArray(uploaded) ? uploaded : [uploaded]).map(f => f.id);
                await authApi.post('/media-library/files/move', {
                    fileIds: ids,
                    targetFolderId: Number(folderId),
                });
            }
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
            await authApi.del('/media-library/files/' + fileId);
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
        if (!selectedFile) return;
        try {
            await authApi.put('/media-library/files/' + selectedFile.id, {
                name: selectedFile.name,
                alternativeText: selectedFile.alternativeText,
                caption: selectedFile.caption,
            });
            toast('Metadata saved.', 'success');
            await loadFiles();
        } catch (err) {
            console.error('Failed to update metadata', err);
            toast('Failed to update metadata.', 'danger');
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

    const copyId = (file) => {
        navigator.clipboard.writeText(String(file.id)).then(() => {
            toast('File ID ' + file.id + ' copied to clipboard.', 'success');
        }).catch(() => {
            toast('Failed to copy ID.', 'danger');
        });
    };

    const [pasteIdValue, setPasteIdValue] = useState('');
    const [pasteIdLoading, setPasteIdLoading] = useState(false);

    const handlePasteId = async () => {
        const id = parseInt(pasteIdValue.trim(), 10);
        if (!id || isNaN(id)) { toast('Enter a valid file ID.', 'warning'); return; }
        setPasteIdLoading(true);
        try {
            const res = await authApi.get('/media-library/files/' + id);
            const file = res.data;
            if (!file) { toast('File not found.', 'warning'); return; }
            setSelectedFile(file);
            setPasteIdValue('');
            toast('File #' + id + ' loaded.', 'success');
        } catch (err) {
            console.error('Failed to fetch file by ID', err);
            toast('File not found or access denied.', 'danger');
        } finally {
            setPasteIdLoading(false);
        }
    };

    // ─── Drag & Drop ────────────────────────────────────────
    const handleFileDragStart = (e, fileId) => {
        const ids = selectedFileIds.has(fileId) ? Array.from(selectedFileIds) : [fileId];
        setDraggedFileIds(ids);
        e.dataTransfer.setData('text/plain', JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleFolderDragOver = (e, folderId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverFolderId(folderId);
    };

    const handleFolderDragLeave = () => { setDragOverFolderId(null); };

    const handleFolderDrop = async (e, targetFolderId) => {
        e.preventDefault();
        setDragOverFolderId(null);
        let ids = draggedFileIds;
        if (ids.length === 0) {
            try { ids = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (_e) { ids = []; }
        }
        if (ids.length === 0) return;
        try {
            await authApi.post('/media-library/files/move', {
                fileIds: ids.map(Number),
                targetFolderId: targetFolderId === 'root' ? null : Number(targetFolderId),
            });
            toast(`Moved ${ids.length} file(s).`, 'success');
            setDraggedFileIds([]);
            setSelectedFileIds(new Set());
            await loadFiles();
        } catch (err) {
            console.error('Failed to move files', err);
            toast('Failed to move files.', 'danger');
        }
    };

    const toggleFileSelect = (fileId, e) => {
        if (e?.ctrlKey || e?.metaKey) {
            setSelectedFileIds(prev => {
                const s = new Set(prev);
                if (s.has(fileId)) s.delete(fileId); else s.add(fileId);
                return s;
            });
        } else {
            setSelectedFile(prev => prev?.id === fileId ? null : files.find(f => f.id === fileId));
        }
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
                            <div className="flex-grow-1" style={{ minWidth: 200, maxWidth: 400 }}>
                                <div className="input-group input-group-sm">
                                    <span className="input-group-text"><i className="fas fa-search" /></span>
                                    <input type="text" className="form-control" placeholder="Search by name, alt text, or caption…" value={search} onChange={e => setSearch(e.target.value)} />
                                    {search && <button className="btn btn-outline-secondary" type="button" onClick={() => setSearch('')}><i className="fas fa-times" /></button>}
                                </div>
                            </div>
                            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={mimeFilter} onChange={e => setMimeFilter(e.target.value)}>
                                <option value="all">All types</option>
                                <option value="image">Images</option>
                                <option value="pdf">PDFs</option>
                                <option value="other">Other</option>
                            </select>
                            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={`${sortField}:${sortOrder}`}
                                onChange={e => { const [f, o] = e.target.value.split(':'); setSortField(f); setSortOrder(o); }}>
                                <option value="createdAt:desc">Newest first</option>
                                <option value="createdAt:asc">Oldest first</option>
                                <option value="name:asc">Name A–Z</option>
                                <option value="name:desc">Name Z–A</option>
                                <option value="size:desc">Largest first</option>
                                <option value="size:asc">Smallest first</option>
                            </select>
                            <div className="btn-group btn-group-sm">
                                <button className={`btn ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setViewMode('grid')} title="Grid view"><i className="fas fa-th" /></button>
                                <button className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setViewMode('list')} title="List view"><i className="fas fa-list" /></button>
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="d-none" onChange={handleUpload} />
                            <button className="btn btn-sm btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                                <i className="fas fa-cloud-upload-alt me-1" />{uploading ? 'Uploading…' : 'Upload Files'}
                            </button>
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => { loadFiles(); loadFolders(); }} disabled={loading} title="Refresh">
                                <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} />
                            </button>
                            <div className="input-group input-group-sm" style={{ width: 'auto', maxWidth: 180 }}>
                                <input type="text" className="form-control" placeholder="Paste file ID" value={pasteIdValue}
                                    onChange={e => setPasteIdValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handlePasteId(); }} />
                                <button className="btn btn-outline-primary" onClick={handlePasteId} disabled={pasteIdLoading || !pasteIdValue.trim()} title="Load file by ID">
                                    <i className={pasteIdLoading ? 'fas fa-spinner fa-spin' : 'fas fa-paste'} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="d-flex" style={{ minHeight: '60vh' }}>
                    {/* Folder sidebar */}
                    <div className="border rounded-start bg-white me-0" style={{ width: 220, minWidth: 220, overflowY: 'auto', padding: '8px 0' }}>
                        <FolderSidebarItem label="All Files" icon="fa-globe" active={currentFolderId === 'all'} onClick={() => setCurrentFolderId('all')} dragOver={false} />
                        <FolderSidebarItem label="Unsorted" icon="fa-inbox" active={currentFolderId === 'root'} onClick={() => setCurrentFolderId('root')}
                            onDragOver={(e) => handleFolderDragOver(e, 'root')} onDragLeave={handleFolderDragLeave}
                            onDrop={(e) => handleFolderDrop(e, 'root')} dragOver={dragOverFolderId === 'root'} />
                        <hr className="my-1 mx-2" />
                        <FolderTreeRenderer nodes={folderTree} depth={0} currentFolderId={currentFolderId} setCurrentFolderId={setCurrentFolderId}
                            expandedFolders={expandedFolders} toggleExpand={toggleExpand} dragOverFolderId={dragOverFolderId}
                            handleFolderDragOver={handleFolderDragOver} handleFolderDragLeave={handleFolderDragLeave} handleFolderDrop={handleFolderDrop}
                            handleDeleteFolder={handleDeleteFolder} renamingFolderId={renamingFolderId} setRenamingFolderId={setRenamingFolderId}
                            renameValue={renameValue} setRenameValue={setRenameValue} handleRenameFolder={handleRenameFolder} />
                        <div className="px-2 mt-2">
                            {creatingFolder ? (
                                <div className="input-group input-group-sm">
                                    <input type="text" className="form-control" placeholder="Folder name" value={newFolderName}
                                        onChange={e => setNewFolderName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); } }}
                                        autoFocus />
                                    <button className="btn btn-success btn-sm" onClick={handleCreateFolder}><i className="fas fa-check" /></button>
                                    <button className="btn btn-outline-secondary btn-sm" onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}><i className="fas fa-times" /></button>
                                </div>
                            ) : (
                                <button className="btn btn-sm btn-outline-secondary w-100" onClick={() => setCreatingFolder(true)}>
                                    <i className="fas fa-folder-plus me-1" /> New Folder
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Main content */}
                    <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0 }}>
                        <div className={`flex-grow-1 ${selectedFile ? 'd-flex' : ''}`} style={{ overflowY: 'auto' }}>
                            <div className={selectedFile ? 'flex-grow-1' : ''} style={{ padding: 16 }}>
                                {loading && files.length === 0 && (
                                    <div className="text-center py-5"><div className="spinner-border text-primary" /><p className="mt-2 text-muted">Loading media…</p></div>
                                )}
                                {!loading && files.length === 0 && (
                                    <div className="text-center py-5 text-muted">
                                        <i className="fas fa-photo-video fa-3x mb-3 d-block" />
                                        <p>{search || mimeFilter !== 'all' ? 'No files match your filters.' : 'No files in this folder.'}</p>
                                        <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                                            <i className="fas fa-cloud-upload-alt me-1" /> Upload your first file
                                        </button>
                                    </div>
                                )}

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
                                                    <div className={`card h-100 ${isActive ? 'border-primary border-2 shadow' : ''}`}
                                                        style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                                                        draggable onDragStart={(e) => handleFileDragStart(e, file.id)}
                                                        onClick={(e) => toggleFileSelect(file.id, e)}>
                                                        <div className="d-flex align-items-center justify-content-center bg-light" style={{ height: 120, overflow: 'hidden', position: 'relative' }}>
                                                            {selectedFileIds.has(file.id) && <div className="position-absolute top-0 start-0 m-1" style={{ zIndex: 2 }}><span className="badge bg-primary"><i className="fas fa-check" /></span></div>}
                                                            {fileIsImage ? <img src={src} alt={file.alternativeText || file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} draggable={false} />
                                                                : fileIsPdf ? <i className="fas fa-file-pdf fa-3x text-danger" />
                                                                    : <i className="fas fa-file fa-3x text-secondary" />}
                                                        </div>
                                                        <div className="card-body p-2">
                                                            <p className="mb-0 small text-truncate" title={file.name}>{file.name}</p>
                                                            <p className="mb-0 text-muted" style={{ fontSize: '0.7rem' }}>
                                                                {file.ext} · {formatBytes(file.size)}
                                                                {file.folder ? <span className="ms-1 text-info"><i className="fas fa-folder fa-xs" /> {file.folder.name}</span> : ''}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {viewMode === 'list' && files.length > 0 && (
                                    <div className="table-responsive">
                                        <table className="table table-hover table-sm align-middle">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 60 }}></th>
                                                    <th>Name</th>
                                                    <th>Folder</th>
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
                                                        <tr key={file.id} className={isActive ? 'table-primary' : ''} style={{ cursor: 'pointer' }}
                                                            draggable onDragStart={(e) => handleFileDragStart(e, file.id)}
                                                            onClick={(e) => toggleFileSelect(file.id, e)}>
                                                            <td>{fileIsImage ? <img src={src} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} draggable={false} />
                                                                : <i className={`fas ${isPDF(file) ? 'fa-file-pdf text-danger' : 'fa-file text-secondary'} fa-lg`} />}</td>
                                                            <td className="text-truncate" style={{ maxWidth: 250 }} title={file.name}>{file.name}</td>
                                                            <td>{file.folder ? <span className="badge bg-light text-dark"><i className="fas fa-folder fa-xs me-1 text-warning" />{file.folder.name}</span> : <span className="text-muted">—</span>}</td>
                                                            <td><span className="badge bg-light text-dark">{file.ext}</span></td>
                                                            <td>{formatBytes(file.size)}</td>
                                                            <td>{file.width && file.height ? `${file.width}×${file.height}` : '—'}</td>
                                                            <td>{new Date(file.createdAt).toLocaleDateString()}</td>
                                                            <td>
                                                                <button className="btn btn-sm btn-outline-secondary me-1" title="Copy ID" onClick={(e) => { e.stopPropagation(); copyId(file); }}><i className="fas fa-hashtag" /></button>
                                                                <button className="btn btn-sm btn-outline-secondary me-1" title="Copy URL" onClick={(e) => { e.stopPropagation(); copyUrl(file); }}><i className="fas fa-link" /></button>
                                                                <button className="btn btn-sm btn-outline-danger" title="Delete" disabled={deleting === file.id} onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }}><i className="fas fa-trash" /></button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {pageCount > 1 && (
                                    <nav className="mt-4 d-flex justify-content-center">
                                        <ul className="pagination pagination-sm mb-0">
                                            <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}><button className="page-link" onClick={() => setPage(p => Math.max(1, p - 1))}>&laquo;</button></li>
                                            {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
                                                let p;
                                                if (pageCount <= 7) p = i + 1;
                                                else if (page <= 4) p = i + 1;
                                                else if (page >= pageCount - 3) p = pageCount - 6 + i;
                                                else p = page - 3 + i;
                                                return <li key={p} className={`page-item ${p === page ? 'active' : ''}`}><button className="page-link" onClick={() => setPage(p)}>{p}</button></li>;
                                            })}
                                            <li className={`page-item ${page >= pageCount ? 'disabled' : ''}`}><button className="page-link" onClick={() => setPage(p => Math.min(pageCount, p + 1))}>&raquo;</button></li>
                                        </ul>
                                    </nav>
                                )}
                            </div>

                            {/* Detail sidebar */}
                            {selectedFile && (
                                <div style={{ width: 300, minWidth: 300, borderLeft: '1px solid #dee2e6', overflowY: 'auto' }}>
                                    <div className="p-3">
                                        <div className="d-flex align-items-center mb-3">
                                            <strong className="flex-grow-1 text-truncate">{selectedFile.name}</strong>
                                            <button className="btn-close btn-sm" onClick={() => setSelectedFile(null)} />
                                        </div>
                                        <div className="text-center mb-3 bg-light p-2 rounded" style={{ maxHeight: 250, overflow: 'hidden' }}>
                                            {isImage(selectedFile) ? <img src={StraipImageUrl(selectedFile)} alt={selectedFile.alternativeText || selectedFile.name} style={{ maxWidth: '100%', maxHeight: 230, objectFit: 'contain' }} />
                                                : isPDF(selectedFile) ? <i className="fas fa-file-pdf fa-5x text-danger my-4" />
                                                    : <i className="fas fa-file fa-5x text-secondary my-4" />}
                                        </div>
                                        <table className="table table-sm small mb-3">
                                            <tbody>
                                                <tr><td className="text-muted">ID</td><td><span className="badge bg-secondary">{selectedFile.id}</span></td></tr>
                                                <tr><td className="text-muted">File name</td><td className="text-break">{selectedFile.name}</td></tr>
                                                <tr><td className="text-muted">Type</td><td>{selectedFile.mime}</td></tr>
                                                <tr><td className="text-muted">Extension</td><td>{selectedFile.ext}</td></tr>
                                                <tr><td className="text-muted">Size</td><td>{formatBytes(selectedFile.size)}</td></tr>
                                                {selectedFile.width && selectedFile.height && <tr><td className="text-muted">Dimensions</td><td>{selectedFile.width} × {selectedFile.height}</td></tr>}
                                                <tr><td className="text-muted">Folder</td><td>{selectedFile.folder ? selectedFile.folder.name : <span className="text-muted">Unsorted</span>}</td></tr>
                                                <tr><td className="text-muted">Uploaded</td><td>{new Date(selectedFile.createdAt).toLocaleString()}</td></tr>
                                            </tbody>
                                        </table>
                                        {/* Editable meta */}
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Alt text</label>
                                            <input type="text" className="form-control form-control-sm" value={selectedFile.alternativeText || ''}
                                                onChange={e => setSelectedFile({ ...selectedFile, alternativeText: e.target.value })} />
                                        </div>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Caption</label>
                                            <input type="text" className="form-control form-control-sm" value={selectedFile.caption || ''}
                                                onChange={e => setSelectedFile({ ...selectedFile, caption: e.target.value })} />
                                        </div>
                                        <button className="btn btn-sm btn-outline-primary w-100 mb-3" onClick={handleUpdateMeta}><i className="fas fa-save me-1" /> Save Metadata</button>
                                        {selectedFile.formats && (
                                            <div className="mb-3">
                                                <p className="small fw-bold mb-1">Available formats:</p>
                                                <div className="d-flex flex-wrap gap-1">
                                                    {Object.entries(selectedFile.formats).map(([key, fmt]) => (
                                                        <span key={key} className="badge bg-light text-dark border" title={`${fmt.width}×${fmt.height}`}>{key} ({fmt.width}×{fmt.height})</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="d-flex flex-wrap gap-2">
                                            <button className="btn btn-sm btn-outline-secondary flex-grow-1" onClick={() => copyId(selectedFile)}><i className="fas fa-hashtag me-1" /> Copy ID</button>
                                            <button className="btn btn-sm btn-outline-secondary flex-grow-1" onClick={() => copyUrl(selectedFile)}><i className="fas fa-link me-1" /> Copy URL</button>
                                            <a className="btn btn-sm btn-outline-primary flex-grow-1" href={StraipImageUrl(selectedFile)} target="_blank" rel="noopener noreferrer"><i className="fas fa-external-link-alt me-1" /> Open</a>
                                            <button className="btn btn-sm btn-outline-danger flex-grow-1" onClick={() => handleDelete(selectedFile.id)} disabled={deleting === selectedFile.id}><i className="fas fa-trash me-1" /> Delete</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Drag hint */}
                {draggedFileIds.length > 0 && (
                    <div className="position-fixed bottom-0 start-50 translate-middle-x mb-3" style={{ zIndex: 9999 }}>
                        <div className="alert alert-info py-2 px-3 shadow d-flex align-items-center mb-0">
                            <i className="fas fa-arrows-alt me-2" /> Drop on a folder to move {draggedFileIds.length} file(s)
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

// ─── Folder sidebar components ──────────────────────────────
function FolderSidebarItem({ label, icon, active, onClick, onDragOver, onDragLeave, onDrop, dragOver, depth, hasChildren, expanded, onToggle, onDelete, isRenaming, renameValue, setRenameValue, onRename, onStartRename }) {
    return (
        <div className={`d-flex align-items-center px-2 py-1${active ? ' bg-primary text-white' : dragOver ? ' bg-info bg-opacity-25' : ''}`}
            style={{ cursor: 'pointer', paddingLeft: 8 + (depth || 0) * 16, fontSize: '0.85rem', transition: 'background 0.15s', userSelect: 'none' }}
            onClick={onClick} onDragOver={onDragOver || undefined} onDragLeave={onDragLeave || undefined} onDrop={onDrop || undefined}>
            {hasChildren !== undefined && (
                <span className="me-1" style={{ width: 16, textAlign: 'center', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); if (onToggle) onToggle(); }}>
                    {hasChildren ? <i className={`fas fa-caret-${expanded ? 'down' : 'right'} fa-sm`} /> : <span style={{ width: 16, display: 'inline-block' }} />}
                </span>
            )}
            <i className={`fas ${icon || 'fa-folder'} me-2${active ? '' : ' text-warning'}`} style={{ fontSize: '0.8rem' }} />
            {isRenaming ? (
                <input type="text" className="form-control form-control-sm flex-grow-1" value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onRename(); if (e.key === 'Escape' && onStartRename) onStartRename(null); }}
                    onClick={e => e.stopPropagation()} autoFocus style={{ height: 22, fontSize: '0.8rem' }} />
            ) : (
                <span className="flex-grow-1 text-truncate">{label}</span>
            )}
            {onDelete && !isRenaming && (
                <span className="ms-auto d-flex gap-1" onClick={e => e.stopPropagation()}>
                    <button className={`btn btn-sm p-0 ${active ? 'text-white' : 'text-muted'}`} title="Rename"
                        onClick={() => { if (onStartRename) onStartRename(); }} style={{ fontSize: '0.7rem', lineHeight: 1 }}><i className="fas fa-pen" /></button>
                    <button className={`btn btn-sm p-0 ${active ? 'text-white' : 'text-danger'}`} title="Delete folder"
                        onClick={(e) => onDelete(e)} style={{ fontSize: '0.7rem', lineHeight: 1 }}><i className="fas fa-trash" /></button>
                </span>
            )}
        </div>
    );
}

function FolderTreeRenderer({ nodes, depth, currentFolderId, setCurrentFolderId, expandedFolders, toggleExpand, dragOverFolderId, handleFolderDragOver, handleFolderDragLeave, handleFolderDrop, handleDeleteFolder, renamingFolderId, setRenamingFolderId, renameValue, setRenameValue, handleRenameFolder }) {
    if (!nodes || nodes.length === 0) return null;
    return nodes.map(folder => {
        const fid = folder.id;
        const hasChildren = folder.children && folder.children.length > 0;
        const isExpanded = expandedFolders.has(fid);
        const isRenaming = renamingFolderId === fid;
        return (
            <React.Fragment key={fid}>
                <FolderSidebarItem label={folder.name} icon={isExpanded && hasChildren ? 'fa-folder-open' : 'fa-folder'}
                    active={String(currentFolderId) === String(fid)} onClick={() => setCurrentFolderId(fid)}
                    onDragOver={(e) => handleFolderDragOver(e, fid)} onDragLeave={handleFolderDragLeave} onDrop={(e) => handleFolderDrop(e, fid)}
                    dragOver={dragOverFolderId === fid} depth={depth} hasChildren={hasChildren} expanded={isExpanded} onToggle={() => toggleExpand(fid)}
                    onDelete={(e) => handleDeleteFolder(fid, e)} isRenaming={isRenaming} renameValue={renameValue} setRenameValue={setRenameValue}
                    onRename={() => handleRenameFolder(fid)}
                    onStartRename={() => { setRenamingFolderId(isRenaming ? null : fid); setRenameValue(folder.name); }} />
                {hasChildren && isExpanded && (
                    <FolderTreeRenderer nodes={folder.children} depth={depth + 1} currentFolderId={currentFolderId} setCurrentFolderId={setCurrentFolderId}
                        expandedFolders={expandedFolders} toggleExpand={toggleExpand} dragOverFolderId={dragOverFolderId}
                        handleFolderDragOver={handleFolderDragOver} handleFolderDragLeave={handleFolderDragLeave} handleFolderDrop={handleFolderDrop}
                        handleDeleteFolder={handleDeleteFolder} renamingFolderId={renamingFolderId} setRenamingFolderId={setRenamingFolderId}
                        renameValue={renameValue} setRenameValue={setRenameValue} handleRenameFolder={handleRenameFolder} />
                )}
            </React.Fragment>
        );
    });
}

export async function getServerSideProps() { return { props: {} }; }
