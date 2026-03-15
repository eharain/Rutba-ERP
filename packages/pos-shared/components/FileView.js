import React, { useRef, useState, useEffect, useCallback } from 'react';
import { storage } from '../lib/storage';
import { authApi, StraipImageUrl, isImage, isPDF } from '../lib/api';
import StrapiMediaLibrary from './StrapiMediaLibrary';
// Utility functions

// Upload helper using fetch so multipart boundaries are handled by the browser.
// Attaches to the entity if ref/refId/field provided (Strapi upload attachment pattern).
export async function uploadToStrapiFiles(files = [], ref, field, refId, info) {
    return await authApi.uploadFile(files, ref, field, refId, info);
}

function FileView({ onFileChange = function (field, files, multiple) { }, single = null, gallery = [], multiple = false, refName = null, refId = null, field = null, autoUpload = true, name = null }) {
    const [singleFile, setSingleFile] = useState(single);
    const [galleryFiles, setGalleryFiles] = useState(gallery);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [showMediaLibrary, setShowMediaLibrary] = useState(false);
    const [pasteIdValue, setPasteIdValue] = useState('');
    const [pasteIdLoading, setPasteIdLoading] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef();
    const containerRef = useRef();

    const handleChange = async (e) => {
        setUploadError(null);
        const selected = Array.from(e.target.files || []);
        if (selected.length === 0) return;

        if (multiple) {
            const current = (galleryFiles ?? []).map((f) => ({ ...f }));

            if (autoUpload && refName && refId && field) {
                setUploading(true);
                try {
                    const uploaded = await uploadToStrapiFiles(selected, refName, field, refId, { name, alt: name, caption: name });
                    const newFiles = Array.isArray(uploaded) ? uploaded : [uploaded];
                    const all = [...current, ...newFiles].filter(f => f);
                    setGalleryFiles(all);
                    onFileChange(field, all, multiple);
                } catch (err) {
                    console.error('Upload error', err);
                    setUploadError(err.message || 'Upload failed');
                } finally {
                    setUploading(false);
                }
            } else {
                // keep local previews only (build simple local file objects for preview)
                const previews = selected.map((f, i) => ({
                    name: f.name,
                    url: URL.createObjectURL(f),
                    mime: f.type
                }));
                setGalleryFiles(previews);
                onFileChange(field, previews, multiple);
                setUploading(false);
            }
        } else {

            if (autoUpload && refName && refId && field) {
                setUploading(true);
                try {
                    const uploaded = await uploadToStrapiFiles([selected[0]], refName, field, refId, { name, alt: name, caption: name });
                    setSingleFile(uploaded[0]);
                    onFileChange(field, uploaded[0], multiple);

                } catch (err) {
                    console.error('Upload error', err);
                    setUploadError(err.message || 'Upload failed');
                } finally {
                    setUploading(false);
                }
            } else {
                // local preview for single
                const preview = { name: selected[0].name, url: URL.createObjectURL(selected[0]), mime: selected[0].type };
                setSingleFile(preview);
                onFileChange(field, preview, multiple);
            }
        }

        // reset input so same file can be selected again if needed
        e.target.value = '';
    };

    const handleRemove = async (index) => {
        const target = galleryFiles[index];
        // If uploaded and has id, attempt to detach/delete from Strapi
        if (target?.id) {
            try {
                await authApi.deleteFile(target.id);
            } catch (err) {
                console.warn('Failed to delete remote file', err);
            }
        }
        const updated = galleryFiles.filter((_, i) => i !== index);
        setGalleryFiles(updated);
        onFileChange(field, updated, multiple);
    };

    const handleRemoveSingle = async () => {
        const target = singleFile;
        if (!target) return;
        if (target?.id) {
            try {
                await authApi.deleteFile(target.id);
            } catch (err) {
                console.warn('Failed to delete remote file', err);
            }
        }
        setSingleFile(null);
        onFileChange(field, null, multiple);
    };

    const handleMediaLibrarySelect = async (selectedFiles) => {
        if (!selectedFiles || selectedFiles.length === 0) return;

        if (multiple) {
            if (autoUpload && refName && refId && field) {
                // Attach selected media to the entity by updating the relation
                const current = (galleryFiles ?? []).map(f => ({ ...f }));
                const existingIds = new Set(current.map(f => f.id));
                const newFiles = selectedFiles.filter(f => !existingIds.has(f.id));
                const all = [...current, ...newFiles];
                setGalleryFiles(all);
                onFileChange(field, all, multiple);
            } else {
                const current = (galleryFiles ?? []).map(f => ({ ...f }));
                const existingIds = new Set(current.map(f => f.id));
                const newFiles = selectedFiles.filter(f => !existingIds.has(f.id));
                const all = [...current, ...newFiles];
                setGalleryFiles(all);
                onFileChange(field, all, multiple);
            }
        } else {
            const picked = selectedFiles[0];
            setSingleFile(picked);
            onFileChange(field, picked, multiple);
        }
    };

    const handlePasteId = async () => {
        const id = parseInt(pasteIdValue.trim(), 10);
        if (!id || isNaN(id)) return;
        setPasteIdLoading(true);
        try {
            const res = await authApi.get('/media-library/files/' + id);
            const file = res.data;
            if (!file) return;
            handleMediaLibrarySelect([file]);
            setPasteIdValue('');
        } catch (err) {
            console.error('Failed to fetch file by ID', err);
        } finally {
            setPasteIdLoading(false);
        }
    };

    const copyFileId = (file) => {
        if (!file || !file.id) return;
        navigator.clipboard.writeText(String(file.id)).catch(function() {});
    };

    const handlePasteUpload = useCallback(async (e) => {
        if (!isFocused) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        const imageFiles = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) imageFiles.push(file);
            }
        }
        if (imageFiles.length === 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setUploadError(null);
        const filesToUpload = multiple ? imageFiles : [imageFiles[0]];
        if (autoUpload && refName && refId && field) {
            setUploading(true);
            try {
                const uploaded = await uploadToStrapiFiles(filesToUpload, refName, field, refId, { name, alt: name, caption: name });
                const newFiles = Array.isArray(uploaded) ? uploaded : [uploaded];
                if (multiple) {
                    const current = (galleryFiles ?? []).map(f => ({ ...f }));
                    const all = [...current, ...newFiles].filter(f => f);
                    setGalleryFiles(all);
                    onFileChange(field, all, multiple);
                } else {
                    setSingleFile(newFiles[0]);
                    onFileChange(field, newFiles[0], multiple);
                }
            } catch (err) {
                console.error('Paste upload error', err);
                setUploadError(err.message || 'Paste upload failed');
            } finally {
                setUploading(false);
            }
        } else {
            if (multiple) {
                const previews = filesToUpload.map(f => ({
                    name: f.name || 'pasted-image',
                    url: URL.createObjectURL(f),
                    mime: f.type
                }));
                const current = (galleryFiles ?? []).map(f => ({ ...f }));
                const all = [...current, ...previews];
                setGalleryFiles(all);
                onFileChange(field, all, multiple);
            } else {
                const f = filesToUpload[0];
                const preview = { name: f.name || 'pasted-image', url: URL.createObjectURL(f), mime: f.type };
                setSingleFile(preview);
                onFileChange(field, preview, multiple);
            }
        }
    }, [isFocused, multiple, autoUpload, refName, refId, field, name, galleryFiles, onFileChange]);

    useEffect(() => {
        document.addEventListener('paste', handlePasteUpload);
        return () => document.removeEventListener('paste', handlePasteUpload);
    }, [handlePasteUpload]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onFocusIn = () => setIsFocused(true);
        const onFocusOut = (e) => {
            if (!el.contains(e.relatedTarget)) setIsFocused(false);
        };
        el.addEventListener('focusin', onFocusIn);
        el.addEventListener('focusout', onFocusOut);
        return () => {
            el.removeEventListener('focusin', onFocusIn);
            el.removeEventListener('focusout', onFocusOut);
        };
    }, []);

    return (
        <div ref={containerRef} tabIndex={-1} style={{ outline: 'none' }}>
            <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple={multiple}
                className="d-none"
                onChange={handleChange}
            />
            <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
                <button
                    type="button"
                    onClick={() => inputRef.current.click()}
                    className="btn btn-primary"
                    disabled={uploading}
                >
                    {multiple ? 'Upload Images/PDFs' : 'Upload Image/PDF'}
                </button>
                <button
                    type="button"
                    onClick={() => setShowMediaLibrary(true)}
                    className="btn btn-outline-secondary"
                    disabled={uploading}
                >
                    <i className="fas fa-photo-video me-1" />
                    Browse Gallery
                </button>
                <div className="input-group input-group-sm" style={{ width: 'auto', maxWidth: 170 }}>
                    <input type="text" className="form-control" placeholder="Paste file ID"
                        value={pasteIdValue} onChange={e => setPasteIdValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handlePasteId(); }} />
                    <button className="btn btn-outline-primary" onClick={handlePasteId}
                        disabled={pasteIdLoading || !pasteIdValue.trim()} title="Attach file by ID">
                        <i className={pasteIdLoading ? 'fas fa-spinner fa-spin' : 'fas fa-paste'} />
                    </button>
                </div>

                {uploading && <div className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true" />}
                {uploadError && <div className="text-danger small align-self-center ms-2">{uploadError}</div>}
            </div>

            <StrapiMediaLibrary
                show={showMediaLibrary}
                onClose={() => setShowMediaLibrary(false)}
                onSelect={handleMediaLibrarySelect}
                multiple={multiple}
                accept="image"
            />

            {/* Single file preview */}
            {!multiple && singleFile && (
                <div className="card mx-auto mb-3" style={{ width: 180, height: 180, position: 'relative' }}>
                    <button
                        type="button"
                        onClick={handleRemoveSingle}
                        className="btn-close position-absolute top-0 end-0 m-2"
                        title="Remove"
                        aria-label="Remove"
                        style={{ zIndex: 2 }}
                    />
                    <div className="d-flex align-items-center justify-content-center h-100">
                        {isImage(singleFile) ? (
                            <img
                                src={StraipImageUrl(singleFile)}
                                alt={singleFile.name}
                                className="img-fluid h-100 w-100"
                                style={{ objectFit: 'cover' }}
                            />
                        ) : isPDF(singleFile) ? (
                            <embed
                                src={StraipImageUrl(singleFile)}
                                type="application/pdf"
                                width="100%"
                                height="100%"
                                style={{ border: 'none' }}
                            />
                        ) : (
                            <span>Unsupported file</span>
                        )}
                    </div>
                    <div className="card-footer text-center p-2 d-flex align-items-center justify-content-center gap-1" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span className="text-truncate">{singleFile.name}</span>
                        {singleFile.id && <button type="button" className="btn btn-sm btn-outline-secondary p-0 px-1" title={'Copy ID: ' + singleFile.id} onClick={() => copyFileId(singleFile)} style={{ fontSize: '0.65rem', lineHeight: 1 }}><i className="fas fa-hashtag" /></button>}
                    </div>
                </div>
            )}

            {/* Gallery view for multiple files */}
            {multiple && galleryFiles?.length > 0 && (
                <div className="row g-3">
                    {galleryFiles.map((fileObj, idx) => (
                        <div key={fileObj.id ?? fileObj.url ?? idx} className="col-6 col-sm-4 col-md-3">
                            <div className="card position-relative" style={{ width: 140, height: 140 }}>
                                <button
                                    type="button"
                                    onClick={() => handleRemove(idx)}
                                    className="btn-close position-absolute top-0 end-0 m-2"
                                    title="Remove"
                                    aria-label="Remove"
                                    style={{ zIndex: 2 }}
                                />
                                <div className="d-flex align-items-center justify-content-center h-100">
                                    {isImage(fileObj) ? (
                                        <img
                                            src={StraipImageUrl(fileObj)}
                                            alt={fileObj.name}
                                            className="img-fluid h-100 w-100"
                                            style={{ objectFit: 'cover' }}
                                        />
                                    ) : isPDF(fileObj) ? (
                                        <embed
                                            src={StraipImageUrl(fileObj)}
                                            type="application/pdf"
                                            width="100%"
                                            height="100%"
                                            style={{ border: 'none' }}
                                        />
                                    ) : (
                                        <span>Unsupported file</span>
                                    )}
                                </div>
                                <div className="card-footer text-center p-2 d-flex align-items-center justify-content-center gap-1" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    <span className="text-truncate">{fileObj.name}</span>
                                    {fileObj.id && <button type="button" className="btn btn-sm btn-outline-secondary p-0 px-1" title={'Copy ID: ' + fileObj.id} onClick={(e) => { e.stopPropagation(); copyFileId(fileObj); }} style={{ fontSize: '0.65rem', lineHeight: 1 }}><i className="fas fa-hashtag" /></button>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default FileView;