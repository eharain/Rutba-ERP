import React, { useRef, useState } from 'react';
import { storage } from '../lib/storage';
import { authApi, StraipImageUrl, isImage, isPDF } from '../lib/api';
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
    const inputRef = useRef();

    const handleChange = async (e) => {
        setUploadError(null);
        const selected = Array.from(e.target.files || []);
        if (selected.length === 0) return;

        if (multiple) {
            // show local previews immediately
            let current = [galleryFiles ?? []].map((f) => { return { ...f } })
            setGalleryFiles([]);

            if (autoUpload && refName && refId && field) {
                setUploading(true);
                try {
                    const uploaded = await uploadToStrapiFiles(selected, refName, field, refId, { name, alt: name, caption: name });
                    const all = [current, uploaded].flat(3).filter(f => f);
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

    return (
        <div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple={multiple}
                className="d-none"
                onChange={handleChange}
            />
            <div className="d-flex gap-2 mb-3">
                <button
                    type="button"
                    onClick={() => inputRef.current.click()}
                    className="btn btn-primary"
                    disabled={uploading}
                >
                    {multiple ? 'Upload Images/PDFs' : 'Upload Image/PDF'}
                </button>

                {uploading && <div className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true" />}
                {uploadError && <div className="text-danger small align-self-center ms-2">{uploadError}</div>}
            </div>

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
                    <div className="card-footer text-center p-2" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {singleFile.name}
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
                                <div className="card-footer text-center p-2" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {fileObj.name}
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