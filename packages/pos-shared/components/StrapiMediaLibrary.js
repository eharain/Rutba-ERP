import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authApi, StraipImageUrl, isImage, isPDF } from '../lib/api';

/**
 * StrapiMediaLibrary - modal component that browses Strapi media with
 * full folder support, search, drag-and-drop, upload-to-folder.
 *
 * Props:
 *   show        - boolean - controls visibility
 *   onClose     - () => void
 *   onSelect    - (files: object[]) => void - called with selected file(s)
 *   multiple    - boolean - allow multi-select (default false)
 *   accept      - "image" | "file" | "all" - filter by mime prefix (default "all")
 */
export default function StrapiMediaLibrary({
    show = false,
    onClose,
    onSelect,
    multiple = false,
    accept = 'all',
}) {
    const [folderTree, setFolderTree] = useState([]);
    const [currentFolderId, setCurrentFolderId] = useState('all');
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const [selected, setSelected] = useState(new Set());
    const [sortField, setSortField] = useState('createdAt');
    const [sortOrder, setSortOrder] = useState('desc');
    const [uploading, setUploading] = useState(false);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [dragOverFolderId, setDragOverFolderId] = useState(null);
    const [draggedFileIds, setDraggedFileIds] = useState([]);
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [renamingFolderId, setRenamingFolderId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const fileInputRef = useRef();
    const PAGE_SIZE = 24;

    const loadFolders = useCallback(async () => {
        if (!show) return;
        try {
            const res = await authApi.get('/media-library/folders/tree');
            setFolderTree(res.data || []);
        } catch (err) {
            console.error('Failed to load folder tree', err);
        }
    }, [show]);

    useEffect(() => { loadFolders(); }, [loadFolders]);

    const loadFiles = useCallback(async () => {
        if (!show) return;
        setLoading(true);
        try {
            const params = {
                sort: sortField + ':' + sortOrder,
                page,
                pageSize: PAGE_SIZE,
            };
            if (currentFolderId && currentFolderId !== 'all') {
                params.folder = currentFolderId;
            }
            if (search.trim()) {
                params.search = search.trim();
            }
            if (accept === 'image') {
                params.mime = 'image';
            }
            const res = await authApi.get('/media-library/files', params);
            setFiles(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount || 1);
        } catch (err) {
            console.error('Failed to load media files', err);
        } finally {
            setLoading(false);
        }
    }, [show, currentFolderId, search, page, sortField, sortOrder, accept]);

    useEffect(() => { loadFiles(); }, [loadFiles]);
    useEffect(() => { if (show) setSelected(new Set()); }, [show]);
    useEffect(() => { setPage(1); }, [search, currentFolderId]);

    const toggleSelect = (fileId) => {
        setSelected(prev => {
            const s = new Set(prev);
            if (s.has(fileId)) { s.delete(fileId); }
            else { if (!multiple) s.clear(); s.add(fileId); }
            return s;
        });
    };

    const handleConfirm = () => {
        const picked = files.filter(f => selected.has(f.id));
        if (picked.length === 0) return;
        onSelect(picked);
        onClose();
    };

    const [pasteIdValue, setPasteIdValue] = useState('');
    const [pasteIdLoading, setPasteIdLoading] = useState(false);

    const copyId = (fileId, e) => {
        if (e) e.stopPropagation();
        navigator.clipboard.writeText(String(fileId)).catch(function() {});
    };

    const handlePasteId = async () => {
        var id = parseInt(pasteIdValue.trim(), 10);
        if (!id || isNaN(id)) return;
        setPasteIdLoading(true);
        try {
            var res = await authApi.get('/media-library/files/' + id);
            var file = res.data;
            if (file) {
                onSelect([file]);
                onClose();
            }
        } catch (err) {
            console.error('Failed to fetch file by ID', err);
        } finally {
            setPasteIdLoading(false);
        }
    };

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
            await loadFiles();
        } catch (err) {
            console.error('Upload failed', err);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            const parentId = (currentFolderId && currentFolderId !== 'all' && currentFolderId !== 'root')
                ? Number(currentFolderId) : null;
            await authApi.post('/media-library/folders', {
                name: newFolderName.trim(),
                parent: parentId,
            });
            setNewFolderName('');
            setCreatingFolder(false);
            await loadFolders();
        } catch (err) {
            console.error('Failed to create folder', err);
        }
    };

    const handleRenameFolder = async (folderId) => {
        if (!renameValue.trim()) return;
        try {
            await authApi.put('/media-library/folders/' + folderId, { name: renameValue.trim() });
            setRenamingFolderId(null);
            setRenameValue('');
            await loadFolders();
        } catch (err) {
            console.error('Failed to rename folder', err);
        }
    };

    const handleDeleteFolder = async (folderId, e) => {
        e.stopPropagation();
        if (!confirm('Delete this folder? Files will be moved to the root.')) return;
        try {
            await authApi.del('/media-library/folders/' + folderId);
            if (String(currentFolderId) === String(folderId)) setCurrentFolderId('all');
            await loadFolders();
            await loadFiles();
        } catch (err) {
            console.error('Failed to delete folder', err);
        }
    };

    const handleFileDragStart = (e, fileId) => {
        const ids = selected.has(fileId) ? Array.from(selected) : [fileId];
        setDraggedFileIds(ids);
        e.dataTransfer.setData('text/plain', JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleFolderDragOver = (e, folderId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverFolderId(folderId);
    };

    const handleFolderDragLeave = () => {
        setDragOverFolderId(null);
    };

    const handleFolderDrop = async (e, targetFolderId) => {
        e.preventDefault();
        setDragOverFolderId(null);
        var ids = draggedFileIds;
        if (ids.length === 0) {
            try { ids = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (_e) { ids = []; }
        }
        if (ids.length === 0) return;
        try {
            await authApi.post('/media-library/files/move', {
                fileIds: ids.map(Number),
                targetFolderId: targetFolderId === 'root' ? null : Number(targetFolderId),
            });
            setDraggedFileIds([]);
            setSelected(new Set());
            await loadFiles();
        } catch (err) {
            console.error('Failed to move files', err);
        }
    };

    const toggleExpand = (folderId) => {
        setExpandedFolders(prev => {
            const s = new Set(prev);
            if (s.has(folderId)) s.delete(folderId); else s.add(folderId);
            return s;
        });
    };

    if (!show) return null;

    return (
        <div className="modal d-block" tabIndex={-1} style={{ background: 'rgba(0,0,0,0.5)', zIndex: 9999 }}>
            <div className="modal-dialog modal-xl modal-dialog-scrollable" style={{ maxWidth: '95vw' }}>
                <div className="modal-content" style={{ minHeight: '80vh' }}>
                    <div className="modal-header py-2">
                        <h5 className="modal-title"><i className="fas fa-photo-video me-2" />Media Library</h5>
                        <button type="button" className="btn-close" onClick={onClose} />
                    </div>

                    <div className="px-3 pt-2 pb-2 border-bottom bg-light">
                        <div className="d-flex flex-wrap align-items-center gap-2">
                            <div className="flex-grow-1" style={{ maxWidth: 350 }}>
                                <div className="input-group input-group-sm">
                                    <span className="input-group-text"><i className="fas fa-search" /></span>
                                    <input type="text" className="form-control" placeholder="Search files..." value={search} onChange={e => setSearch(e.target.value)} />
                                    {search && <button className="btn btn-outline-secondary" onClick={() => setSearch('')}><i className="fas fa-times" /></button>}
                                </div>
                            </div>
                            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={sortField + ':' + sortOrder}
                                onChange={e => { var p = e.target.value.split(':'); setSortField(p[0]); setSortOrder(p[1]); }}>
                                <option value="createdAt:desc">Newest</option>
                                <option value="createdAt:asc">Oldest</option>
                                <option value="name:asc">Name A-Z</option>
                                <option value="name:desc">Name Z-A</option>
                                <option value="size:desc">Largest</option>
                                <option value="size:asc">Smallest</option>
                            </select>
                            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="d-none" onChange={handleUpload} />
                            <button className="btn btn-sm btn-outline-primary" onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading}>
                                <i className="fas fa-cloud-upload-alt me-1" />{uploading ? 'Uploading...' : 'Upload'}
                            </button>
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => { loadFiles(); loadFolders(); }} disabled={loading} title="Refresh">
                                <i className={'fas fa-sync-alt' + (loading ? ' fa-spin' : '')} />
                            </button>
                            <div className="input-group input-group-sm" style={{ width: 'auto', maxWidth: 160 }}>
                                <input type="text" className="form-control" placeholder="Paste ID" value={pasteIdValue}
                                    onChange={e => setPasteIdValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handlePasteId(); }} />
                                <button className="btn btn-outline-primary" onClick={handlePasteId} disabled={pasteIdLoading || !pasteIdValue.trim()} title="Attach file by ID">
                                    <i className={pasteIdLoading ? 'fas fa-spinner fa-spin' : 'fas fa-paste'} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="modal-body p-0 d-flex" style={{ overflowY: 'hidden', minHeight: 0 }}>
                        <div className="border-end bg-white" style={{ width: 220, minWidth: 220, overflowY: 'auto', padding: '8px 0' }}>
                            <FolderItem label="All Files" icon="fa-globe" active={currentFolderId === 'all'} onClick={() => setCurrentFolderId('all')} dragOver={false} />
                            <FolderItem label="Unsorted" icon="fa-inbox" active={currentFolderId === 'root'} onClick={() => setCurrentFolderId('root')}
                                onDragOver={function(e) { handleFolderDragOver(e, 'root'); }} onDragLeave={handleFolderDragLeave}
                                onDrop={function(e) { handleFolderDrop(e, 'root'); }} dragOver={dragOverFolderId === 'root'} />
                            <hr className="my-1 mx-2" />
                            <FolderTreeNode nodes={folderTree} depth={0} currentFolderId={currentFolderId} setCurrentFolderId={setCurrentFolderId}
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

                        <div className="flex-grow-1" style={{ overflowY: 'auto', padding: 16 }}>
                            {loading && files.length === 0 && (
                                <div className="text-center py-5"><div className="spinner-border text-primary" /><p className="mt-2 text-muted">Loading...</p></div>
                            )}
                            {!loading && files.length === 0 && (
                                <div className="text-center py-5 text-muted"><i className="fas fa-photo-video fa-3x mb-3 d-block" />{search ? 'No files match your search.' : 'No files in this folder.'}</div>
                            )}
                            <div className="row g-2">
                                {files.map(file => {
                                    var isSelected = selected.has(file.id);
                                    var thumb = file.formats && (file.formats.thumbnail || file.formats.small) || file;
                                    var src = StraipImageUrl(thumb);
                                    var fileIsImage = isImage(file);
                                    var fileIsPdf = isPDF(file);
                                    return (
                                        <div key={file.id} className="col-6 col-sm-4 col-md-3 col-lg-2">
                                            <div className={'card h-100' + (isSelected ? ' border-primary border-2 shadow' : '')}
                                                style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                                                draggable onDragStart={function(e) { handleFileDragStart(e, file.id); }} onClick={() => toggleSelect(file.id)}>
                                                <div className="d-flex align-items-center justify-content-center bg-light" style={{ height: 100, overflow: 'hidden', position: 'relative' }}>
                                                    {isSelected && <div className="position-absolute top-0 start-0 m-1" style={{ zIndex: 2 }}><span className="badge bg-primary"><i className="fas fa-check" /></span></div>}
                                                    <button className="btn btn-sm p-0 position-absolute top-0 end-0 m-1 text-muted" style={{ zIndex: 2, fontSize: '0.65rem', lineHeight: 1 }}
                                                        title={'Copy ID: ' + file.id} onClick={function(e) { copyId(file.id, e); }}><i className="fas fa-hashtag" /></button>
                                                    {fileIsImage ? <img src={src} alt={file.alternativeText || file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} draggable={false} />
                                                        : fileIsPdf ? <i className="fas fa-file-pdf fa-2x text-danger" />
                                                            : <i className="fas fa-file fa-2x text-secondary" />}
                                                </div>
                                                <div className="card-body p-1">
                                                    <p className="mb-0 text-truncate" style={{ fontSize: '0.7rem' }} title={file.name}>{file.name}</p>
                                                    <p className="mb-0 text-muted" style={{ fontSize: '0.6rem' }}>#{file.id} - {formatBytes(file.size)}{file.width && file.height ? ' - ' + file.width + 'x' + file.height : ''}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {pageCount > 1 && (
                                <nav className="mt-3 d-flex justify-content-center">
                                    <ul className="pagination pagination-sm mb-0">
                                        <li className={'page-item' + (page <= 1 ? ' disabled' : '')}><button className="page-link" onClick={() => setPage(p => Math.max(1, p - 1))}>&laquo;</button></li>
                                        {paginationPages(page, pageCount).map(p => (
                                            <li key={p} className={'page-item' + (p === page ? ' active' : '')}><button className="page-link" onClick={() => setPage(p)}>{p}</button></li>
                                        ))}
                                        <li className={'page-item' + (page >= pageCount ? ' disabled' : '')}><button className="page-link" onClick={() => setPage(p => Math.min(pageCount, p + 1))}>&raquo;</button></li>
                                    </ul>
                                </nav>
                            )}
                        </div>
                    </div>

                    <div className="modal-footer py-2">
                        <span className="me-auto text-muted small">
                            {selected.size > 0 ? selected.size + ' file(s) selected' : 'Select a file to attach'}
                            {draggedFileIds.length > 0 && <span className="ms-2 text-primary"><i className="fas fa-arrows-alt me-1" />Drag to a folder</span>}
                        </span>
                        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
                        <button className="btn btn-primary btn-sm" disabled={selected.size === 0} onClick={handleConfirm}>
                            <i className="fas fa-check me-1" />{multiple ? 'Attach Selected' : 'Select'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function FolderItem({ label, icon, active, onClick, onDragOver, onDragLeave, onDrop, dragOver, depth, hasChildren, expanded, onToggle, onDelete, isRenaming, renameValue, setRenameValue, onRename, onStartRename }) {
    return (
        <div className={'d-flex align-items-center px-2 py-1' + (active ? ' bg-primary text-white' : dragOver ? ' bg-info bg-opacity-25' : '')}
            style={{ cursor: 'pointer', paddingLeft: 8 + (depth || 0) * 16, fontSize: '0.85rem', transition: 'background 0.15s', userSelect: 'none' }}
            onClick={onClick} onDragOver={onDragOver || undefined} onDragLeave={onDragLeave || undefined} onDrop={onDrop || undefined}>
            {hasChildren !== undefined && (
                <span className="me-1" style={{ width: 16, textAlign: 'center', cursor: 'pointer' }}
                    onClick={function(e) { e.stopPropagation(); if (onToggle) onToggle(); }}>
                    {hasChildren ? <i className={'fas fa-caret-' + (expanded ? 'down' : 'right') + ' fa-sm'} /> : <span style={{ width: 16, display: 'inline-block' }} />}
                </span>
            )}
            <i className={'fas ' + (icon || 'fa-folder') + ' me-2' + (active ? '' : ' text-warning')} style={{ fontSize: '0.8rem' }} />
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
                    <button className={'btn btn-sm p-0 ' + (active ? 'text-white' : 'text-muted')} title="Rename"
                        onClick={() => { if (onStartRename) onStartRename(); }} style={{ fontSize: '0.7rem', lineHeight: 1 }}><i className="fas fa-pen" /></button>
                    <button className={'btn btn-sm p-0 ' + (active ? 'text-white' : 'text-danger')} title="Delete folder"
                        onClick={function(e) { onDelete(e); }} style={{ fontSize: '0.7rem', lineHeight: 1 }}><i className="fas fa-trash" /></button>
                </span>
            )}
        </div>
    );
}

function FolderTreeNode({ nodes, depth, currentFolderId, setCurrentFolderId, expandedFolders, toggleExpand, dragOverFolderId, handleFolderDragOver, handleFolderDragLeave, handleFolderDrop, handleDeleteFolder, renamingFolderId, setRenamingFolderId, renameValue, setRenameValue, handleRenameFolder }) {
    if (!nodes || nodes.length === 0) return null;
    return nodes.map(folder => {
        var fid = folder.id;
        var hasChildren = folder.children && folder.children.length > 0;
        var isExpanded = expandedFolders.has(fid);
        var isRenaming = renamingFolderId === fid;
        return (
            <React.Fragment key={fid}>
                <FolderItem label={folder.name} icon={isExpanded && hasChildren ? 'fa-folder-open' : 'fa-folder'}
                    active={String(currentFolderId) === String(fid)} onClick={() => setCurrentFolderId(fid)}
                    onDragOver={function(e) { handleFolderDragOver(e, fid); }} onDragLeave={handleFolderDragLeave} onDrop={function(e) { handleFolderDrop(e, fid); }}
                    dragOver={dragOverFolderId === fid} depth={depth} hasChildren={hasChildren} expanded={isExpanded} onToggle={() => toggleExpand(fid)}
                    onDelete={function(e) { handleDeleteFolder(fid, e); }} isRenaming={isRenaming} renameValue={renameValue} setRenameValue={setRenameValue}
                    onRename={() => handleRenameFolder(fid)}
                    onStartRename={() => { setRenamingFolderId(isRenaming ? null : fid); setRenameValue(folder.name); }} />
                {hasChildren && isExpanded && (
                    <FolderTreeNode nodes={folder.children} depth={depth + 1} currentFolderId={currentFolderId} setCurrentFolderId={setCurrentFolderId}
                        expandedFolders={expandedFolders} toggleExpand={toggleExpand} dragOverFolderId={dragOverFolderId}
                        handleFolderDragOver={handleFolderDragOver} handleFolderDragLeave={handleFolderDragLeave} handleFolderDrop={handleFolderDrop}
                        handleDeleteFolder={handleDeleteFolder} renamingFolderId={renamingFolderId} setRenamingFolderId={setRenamingFolderId}
                        renameValue={renameValue} setRenameValue={setRenameValue} handleRenameFolder={handleRenameFolder} />
                )}
            </React.Fragment>
        );
    });
}

function formatBytes(kb) {
    if (!kb && kb !== 0) return '';
    if (kb < 1) return Math.round(kb * 1024) + ' B';
    if (kb < 1024) return Math.round(kb) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
}

function paginationPages(current, total) {
    var max = 7;
    if (total <= max) return Array.from({ length: total }, function(_, i) { return i + 1; });
    if (current <= 4) return Array.from({ length: max }, function(_, i) { return i + 1; });
    if (current >= total - 3) return Array.from({ length: max }, function(_, i) { return total - max + 1 + i; });
    return Array.from({ length: max }, function(_, i) { return current - 3 + i; });
}
