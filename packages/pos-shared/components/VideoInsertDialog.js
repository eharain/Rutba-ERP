import { useState, useCallback, useEffect, useRef } from 'react';

const SIZE_OPTIONS = [
    { value: 'small', label: 'Small', maxWidth: '400px' },
    { value: 'medium', label: 'Medium', maxWidth: '640px' },
    { value: 'large', label: 'Large', maxWidth: '960px' },
    { value: 'full', label: 'Full Width', maxWidth: '100%' },
];

const VIDEO_URL_HINTS = [
    { provider: 'YouTube', example: 'https://www.youtube.com/watch?v=VIDEO_ID' },
    { provider: 'Vimeo', example: 'https://vimeo.com/VIDEO_ID' },
    { provider: 'TikTok', example: 'https://www.tiktok.com/@user/video/VIDEO_ID' },
    { provider: 'Dailymotion', example: 'https://www.dailymotion.com/video/VIDEO_ID' },
    { provider: 'Instagram', example: 'https://www.instagram.com/reel/VIDEO_ID' },
    { provider: 'Facebook', example: 'https://www.facebook.com/watch/?v=VIDEO_ID' },
    { provider: 'Twitter / X', example: 'https://x.com/user/status/TWEET_ID' },
];

export default function VideoInsertDialog({ isOpen, onInsert, onClose }) {
    const [videoUrl, setVideoUrl] = useState('');
    const [size, setSize] = useState('full');
    const [overlayUrl, setOverlayUrl] = useState('');
    const [overlayError, setOverlayError] = useState(false);
    const urlRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setVideoUrl('');
            setSize('full');
            setOverlayUrl('');
            setOverlayError(false);
            requestAnimationFrame(() => urlRef.current?.focus());
        }
    }, [isOpen]);

    const handleInsert = useCallback(() => {
        if (!videoUrl.trim()) return;
        const attrs = [];
        if (size !== 'full') attrs.push(`size="${size}"`);
        if (overlayUrl.trim()) attrs.push(`overlay="${overlayUrl.trim()}"`);
        const directive = attrs.length > 0
            ? `\n::video[${videoUrl.trim()}]{${attrs.join(' ')}}\n`
            : `\n${videoUrl.trim()}\n`;
        onInsert(directive);
    }, [videoUrl, size, overlayUrl, onInsert]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleInsert();
        }
        if (e.key === 'Escape') onClose();
    }, [handleInsert, onClose]);

    const selectedSize = SIZE_OPTIONS.find(s => s.value === size);

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-backdrop fade show" style={{ zIndex: 1055 }} onClick={onClose} />
            <div className="modal fade show d-block" tabIndex={-1} style={{ zIndex: 1060 }} onKeyDown={handleKeyDown}>
                <div className="modal-dialog modal-dialog-centered modal-lg">
                    <div className="modal-content">
                        {/* Header */}
                        <div className="modal-header">
                            <h5 className="modal-title">
                                <i className="fas fa-video me-2" />Insert Video
                            </h5>
                            <button type="button" className="btn-close" onClick={onClose} />
                        </div>

                        {/* Body */}
                        <div className="modal-body">
                            {/* Video URL */}
                            <div className="mb-3">
                                <label className="form-label fw-bold">Video URL <span className="text-danger">*</span></label>
                                <input
                                    ref={urlRef}
                                    type="url"
                                    className="form-control"
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    value={videoUrl}
                                    onChange={e => setVideoUrl(e.target.value)}
                                />
                                <div className="form-text">
                                    Supported:&nbsp;
                                    {VIDEO_URL_HINTS.map((h, i) => (
                                        <span key={h.provider}>
                                            {i > 0 && ', '}
                                            <span
                                                className="text-primary"
                                                style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                                                title={h.example}
                                                onClick={() => setVideoUrl(h.example)}
                                            >
                                                {h.provider}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Size */}
                            <div className="mb-3">
                                <label className="form-label fw-bold">Size</label>
                                <div className="d-flex gap-2 flex-wrap">
                                    {SIZE_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={`btn btn-sm ${size === opt.value ? 'btn-primary' : 'btn-outline-secondary'}`}
                                            onClick={() => setSize(opt.value)}
                                        >
                                            {opt.label}
                                            <span className="ms-1 text-muted" style={{ fontSize: '0.75em' }}>
                                                ({opt.maxWidth})
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Overlay Image */}
                            <div className="mb-3">
                                <label className="form-label fw-bold">
                                    Overlay / Thumbnail Image
                                    <span className="text-muted fw-normal ms-1">(optional)</span>
                                </label>
                                <input
                                    type="url"
                                    className="form-control"
                                    placeholder="https://example.com/thumbnail.jpg"
                                    value={overlayUrl}
                                    onChange={e => { setOverlayUrl(e.target.value); setOverlayError(false); }}
                                />
                                <div className="form-text">
                                    When set, the video shows this image with a play button. Clicking it starts the video.
                                </div>
                            </div>

                            {/* Preview */}
                            {videoUrl.trim() && (
                                <div className="mb-2">
                                    <label className="form-label fw-bold text-muted">Preview</label>
                                    <div
                                        className="border rounded p-3 bg-light"
                                        style={{ maxWidth: selectedSize?.maxWidth || '100%', margin: '0 auto' }}
                                    >
                                        {overlayUrl.trim() ? (
                                            <div style={{ position: 'relative', cursor: 'pointer' }}>
                                                {!overlayError ? (
                                                    <img
                                                        src={overlayUrl}
                                                        alt="Video overlay"
                                                        style={{ width: '100%', display: 'block', borderRadius: 6 }}
                                                        onError={() => setOverlayError(true)}
                                                    />
                                                ) : (
                                                    <div
                                                        className="d-flex align-items-center justify-content-center bg-secondary bg-opacity-25 rounded"
                                                        style={{ width: '100%', aspectRatio: '16/9' }}
                                                    >
                                                        <span className="text-muted small">Image failed to load</span>
                                                    </div>
                                                )}
                                                {/* Play button */}
                                                <div style={{
                                                    position: 'absolute', top: '50%', left: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    width: 64, height: 64,
                                                    background: 'rgba(0,0,0,0.6)', borderRadius: '50%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <div style={{
                                                        width: 0, height: 0,
                                                        borderTop: '12px solid transparent',
                                                        borderBottom: '12px solid transparent',
                                                        borderLeft: '20px solid #fff',
                                                        marginLeft: 4,
                                                    }} />
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className="d-flex align-items-center justify-content-center bg-dark bg-opacity-10 rounded"
                                                style={{ width: '100%', aspectRatio: '16/9' }}
                                            >
                                                <i className="fas fa-play-circle fa-3x text-muted" />
                                            </div>
                                        )}
                                        <div className="text-center mt-2">
                                            <small className="text-muted text-break">{videoUrl}</small>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="modal-footer">
                            <small className="text-muted me-auto">
                                <kbd>Ctrl+Enter</kbd> to insert
                            </small>
                            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleInsert}
                                disabled={!videoUrl.trim()}
                            >
                                <i className="fas fa-plus me-1" />Insert Video
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
