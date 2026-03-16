import { useState, useRef, useCallback, useEffect } from 'react';
import { marked } from '../lib/marked.esm.js';
import { markedVideoEmbed } from '../lib/marked-video-embed.js';
import { IMAGE_URL } from '../lib/api';
import VideoInsertDialog from './VideoInsertDialog';
import StrapiMediaLibrary from './StrapiMediaLibrary';

marked.setOptions({ breaks: true, gfm: true });
marked.use(markedVideoEmbed({ imageBaseUrl: IMAGE_URL }));

const TOOLBAR = [
    { icon: 'fa-heading', label: 'H1', md: (s) => `# ${s || 'Heading'}`, wrap: false },
    { icon: 'fa-heading', label: 'H2', md: (s) => `## ${s || 'Heading'}`, wrap: false, small: true },
    { icon: 'fa-heading', label: 'H3', md: (s) => `### ${s || 'Heading'}`, wrap: false, smaller: true },
    { type: 'sep' },
    { icon: 'fa-bold', label: 'Bold', md: (s) => `**${s || 'bold'}**`, wrap: true, key: 'b' },
    { icon: 'fa-italic', label: 'Italic', md: (s) => `*${s || 'italic'}*`, wrap: true, key: 'i' },
    { icon: 'fa-strikethrough', label: 'Strikethrough', md: (s) => `~~${s || 'text'}~~`, wrap: true },
    { type: 'sep' },
    { icon: 'fa-list-ul', label: 'Bullet List', md: (s) => `- ${s || 'item'}`, wrap: false },
    { icon: 'fa-list-ol', label: 'Numbered List', md: (s) => `1. ${s || 'item'}`, wrap: false },
    { icon: 'fa-quote-left', label: 'Quote', md: (s) => `> ${s || 'quote'}`, wrap: false },
    { type: 'sep' },
    { icon: 'fa-code', label: 'Code', md: (s) => `\`${s || 'code'}\``, wrap: true },
    { icon: 'fa-link', label: 'Link', md: (s) => `[${s || 'text'}](url)`, wrap: true },
    { type: 'sep' },
    { icon: 'fa-ruler-horizontal', label: 'Horizontal Rule', md: () => `\n---\n`, wrap: false },
    { icon: 'fa-table', label: 'Table', md: () => `| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |`, wrap: false },
];

export default function MarkdownEditor({ value = '', onChange, name, rows = 12, placeholder = 'Write markdown...' }) {
    const textareaRef = useRef(null);
    const [mode, setMode] = useState('split'); // 'edit', 'preview', 'split'
    const [videoDialogOpen, setVideoDialogOpen] = useState(false);
    const [imageLibOpen, setImageLibOpen] = useState(false);

    const insertMarkdown = useCallback((toolItem) => {
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = value.substring(start, end);
        const replacement = toolItem.md(selected);
        const newValue = value.substring(0, start) + replacement + value.substring(end);
        onChange({ target: { name, value: newValue } });

        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
            ta.focus();
            const cursorPos = start + replacement.length;
            ta.setSelectionRange(cursorPos, cursorPos);
        });
    }, [value, onChange, name]);

    const handleKeyDown = useCallback((e) => {
        if ((e.ctrlKey || e.metaKey)) {
            const tool = TOOLBAR.find(t => t.key === e.key);
            if (tool) {
                e.preventDefault();
                insertMarkdown(tool);
            }
        }
        // Tab key inserts spaces
        if (e.key === 'Tab') {
            e.preventDefault();
            const ta = e.target;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const newValue = value.substring(0, start) + '    ' + value.substring(end);
            onChange({ target: { name, value: newValue } });
            requestAnimationFrame(() => {
                ta.setSelectionRange(start + 4, start + 4);
            });
        }
    }, [value, onChange, name, insertMarkdown]);

    const getPreviewHtml = useCallback(() => {
        try {
            return marked.parse(value || '');
        } catch {
            return '';
        }
    }, [value]);

    const handleImageSelect = useCallback((files) => {
        const ta = textareaRef.current;
        const pos = ta ? ta.selectionStart : value.length;
        const md = files.map(f => `![${f.alternativeText || f.name || 'image'}](${f.url})`).join('\n');
        const insert = '\n' + md + '\n';
        const newValue = value.substring(0, pos) + insert + value.substring(pos);
        onChange({ target: { name, value: newValue } });
        setImageLibOpen(false);
        requestAnimationFrame(() => {
            if (ta) {
                ta.focus();
                const cursorPos = pos + insert.length;
                ta.setSelectionRange(cursorPos, cursorPos);
            }
        });
    }, [value, onChange, name]);

    const handleVideoInsert = useCallback((directive) => {
        const ta = textareaRef.current;
        const pos = ta ? ta.selectionStart : value.length;
        const newValue = value.substring(0, pos) + directive + value.substring(pos);
        onChange({ target: { name, value: newValue } });
        setVideoDialogOpen(false);
        requestAnimationFrame(() => {
            if (ta) {
                ta.focus();
                const cursorPos = pos + directive.length;
                ta.setSelectionRange(cursorPos, cursorPos);
            }
        });
    }, [value, onChange, name]);

    return (
        <div className="border rounded" style={{ overflow: 'hidden' }}>
            {/* Toolbar */}
            <div className="d-flex flex-wrap align-items-center gap-1 p-2 border-bottom bg-light">
                {TOOLBAR.map((item, idx) => {
                    if (item.type === 'sep') {
                        return <div key={idx} style={{ width: 1, height: 20, background: '#ccc' }} />;
                    }
                    return (
                        <button
                            key={idx}
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            title={item.label + (item.key ? ` (Ctrl+${item.key.toUpperCase()})` : '')}
                            onClick={() => insertMarkdown(item)}
                            style={{ padding: '2px 6px', fontSize: item.smaller ? '10px' : item.small ? '11px' : '13px' }}
                        >
                            <i className={`fas ${item.icon}`} />
                            {(item.small || item.smaller) && <span style={{ fontSize: '9px', marginLeft: 1 }}>{item.label.replace('H', '')}</span>}
                        </button>
                    );
                })}

                <div style={{ width: 1, height: 20, background: '#ccc' }} />
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    title="Insert Image from Media Library"
                    onClick={() => setImageLibOpen(true)}
                    style={{ padding: '2px 6px', fontSize: '13px' }}
                >
                    <i className="fas fa-image" />
                </button>
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    title="Insert Video"
                    onClick={() => setVideoDialogOpen(true)}
                    style={{ padding: '2px 6px', fontSize: '13px' }}
                >
                    <i className="fas fa-video" />
                </button>

                <div className="ms-auto d-flex gap-1">
                    <button type="button" className={`btn btn-sm ${mode === 'edit' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setMode('edit')} title="Edit only">
                        <i className="fas fa-pen" />
                    </button>
                    <button type="button" className={`btn btn-sm ${mode === 'split' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setMode('split')} title="Split view">
                        <i className="fas fa-columns" />
                    </button>
                    <button type="button" className={`btn btn-sm ${mode === 'preview' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setMode('preview')} title="Preview">
                        <i className="fas fa-eye" />
                    </button>
                </div>
            </div>

            {/* Editor + Preview */}
            <div className="d-flex" style={{ minHeight: `${rows * 24}px` }}>
                {mode !== 'preview' && (
                    <div style={{ flex: mode === 'split' ? '1 1 50%' : '1 1 100%', borderRight: mode === 'split' ? '1px solid #dee2e6' : 'none' }}>
                        <textarea
                            ref={textareaRef}
                            name={name}
                            value={value}
                            onChange={onChange}
                            onKeyDown={handleKeyDown}
                            rows={rows}
                            placeholder={placeholder}
                            className="form-control border-0 rounded-0"
                            style={{
                                resize: 'vertical',
                                minHeight: `${rows * 24}px`,
                                fontFamily: 'monospace',
                                fontSize: '14px',
                                height: '100%',
                            }}
                        />
                    </div>
                )}
                {mode !== 'edit' && (
                    <div
                        className="p-3 overflow-auto"
                        style={{
                            flex: mode === 'split' ? '1 1 50%' : '1 1 100%',
                            minHeight: `${rows * 24}px`,
                            background: '#fff',
                            fontSize: '14px',
                        }}
                        dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                    />
                )}
            </div>
            <VideoInsertDialog
                isOpen={videoDialogOpen}
                onInsert={handleVideoInsert}
                onClose={() => setVideoDialogOpen(false)}
                imageBaseUrl={IMAGE_URL}
            />
            <StrapiMediaLibrary
                show={imageLibOpen}
                onClose={() => setImageLibOpen(false)}
                accept="image"
                multiple
                onSelect={handleImageSelect}
            />
        </div>
    );
}
