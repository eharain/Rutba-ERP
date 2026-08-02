import { useEffect, useState } from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import {
    loadState, createList, renameList, deleteList, moveList,
    removeEntry, moveEntry, moveEntryWithin, entryKeyOf,
    MAX_ITEMS_PER_LIST, MAX_LISTS, PINNED_CHANGED_EVENT,
} from '../lib/pinnedLists';

/**
 * Manage the till's named pinned lists: create, rename, reorder and delete
 * lists, and move / reorder / remove the products inside them.
 *
 * Two panes rather than one, because the two jobs are different: picking WHICH
 * list you're editing, and arranging what's in it. A single flat view made
 * "move this to another list" awkward — the destination has to be visible.
 *
 * Everything writes straight through to localStorage and fires
 * PINNED_CHANGED_EVENT, so the quick-add rail behind the modal updates live.
 */
export default function PinnedListsManager({ isOpen, onClose }) {
    const { branch, desk, currency } = useUtil();
    const [state, setState] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [renamingId, setRenamingId] = useState(null);
    const [draftName, setDraftName] = useState('');
    const [newName, setNewName] = useState('');

    const refresh = () => {
        const s = loadState(branch, desk);
        setState(s);
        setSelectedId(prev => (s.lists.some(l => l.id === prev) ? prev : s.activeId));
    };

    useEffect(() => {
        if (!isOpen) return undefined;
        refresh();
        // Someone may pin from the search box while this is open.
        const handler = () => refresh();
        window.addEventListener(PINNED_CHANGED_EVENT, handler);
        return () => window.removeEventListener(PINNED_CHANGED_EVENT, handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, branch?.id, branch?.documentId, desk?.id]);

    if (!isOpen || !state) return null;

    const selected = state.lists.find(l => l.id === selectedId) || state.lists[0];
    const otherLists = state.lists.filter(l => l.id !== selected.id);

    const apply = (fn) => { fn(); refresh(); };

    const handleCreate = () => {
        const name = newName.trim();
        if (!name) return;
        if (state.lists.length >= MAX_LISTS) return;
        apply(() => {
            const created = createList(branch, desk, name);
            if (created) setSelectedId(created.id);
        });
        setNewName('');
    };

    const commitRename = () => {
        const name = draftName.trim();
        if (renamingId && name) apply(() => renameList(branch, desk, renamingId, name));
        setRenamingId(null);
        setDraftName('');
    };

    const handleDelete = (list) => {
        const msg = list.items.length
            ? `Delete "${list.name}" and its ${list.items.length} pinned item(s)?`
            : `Delete "${list.name}"?`;
        if (!confirm(msg)) return;
        apply(() => deleteList(branch, desk, list.id));
    };

    return (
        <div className="modal d-block" tabIndex={-1} style={{ background: 'rgba(0,0,0,0.5)' }} role="dialog">
            <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
                <div className="modal-content">
                    <div className="modal-header py-2">
                        <h6 className="modal-title">
                            <i className="fas fa-thumbtack me-2 text-warning"></i>Pinned lists
                        </h6>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>

                    <div className="modal-body p-0">
                        <div className="row g-0" style={{ minHeight: 340 }}>

                            {/* ── Lists ── */}
                            <div className="col-5 border-end">
                                <div className="p-2 border-bottom bg-light small text-muted d-flex justify-content-between">
                                    <span>Lists</span>
                                    <span>{state.lists.length}/{MAX_LISTS}</span>
                                </div>
                                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                    {state.lists.map((l, i) => (
                                        <div
                                            key={l.id}
                                            className={`px-2 py-1 border-bottom d-flex align-items-center gap-1 ${l.id === selected.id ? 'bg-primary bg-opacity-10' : ''}`}
                                        >
                                            {renamingId === l.id ? (
                                                <input
                                                    className="form-control form-control-sm"
                                                    value={draftName}
                                                    autoFocus
                                                    maxLength={40}
                                                    onChange={(e) => setDraftName(e.target.value)}
                                                    onBlur={commitRename}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') commitRename();
                                                        if (e.key === 'Escape') { setRenamingId(null); setDraftName(''); }
                                                    }}
                                                />
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-link text-decoration-none text-start flex-grow-1 p-0"
                                                    onClick={() => setSelectedId(l.id)}
                                                    style={{ minWidth: 0 }}
                                                >
                                                    <span className="d-block text-truncate">
                                                        {l.id === state.activeId && (
                                                            <i className="fas fa-circle text-success me-1" style={{ fontSize: 6, verticalAlign: 'middle' }}
                                                               title="Shown on the quick-add rail" />
                                                        )}
                                                        {l.name}
                                                        <span className="text-muted ms-1">({l.items.length})</span>
                                                    </span>
                                                </button>
                                            )}
                                            <button type="button" className="btn btn-sm btn-link text-muted p-0 px-1"
                                                    title="Move up" disabled={i === 0}
                                                    onClick={() => apply(() => moveList(branch, desk, l.id, -1))}>
                                                <i className="fas fa-chevron-up" style={{ fontSize: 10 }} />
                                            </button>
                                            <button type="button" className="btn btn-sm btn-link text-muted p-0 px-1"
                                                    title="Move down" disabled={i === state.lists.length - 1}
                                                    onClick={() => apply(() => moveList(branch, desk, l.id, 1))}>
                                                <i className="fas fa-chevron-down" style={{ fontSize: 10 }} />
                                            </button>
                                            <button type="button" className="btn btn-sm btn-link text-muted p-0 px-1"
                                                    title="Rename"
                                                    onClick={() => { setRenamingId(l.id); setDraftName(l.name); }}>
                                                <i className="fas fa-pen" style={{ fontSize: 10 }} />
                                            </button>
                                            <button type="button" className="btn btn-sm btn-link text-danger p-0 px-1"
                                                    title="Delete list"
                                                    onClick={() => handleDelete(l)}>
                                                <i className="fas fa-trash" style={{ fontSize: 10 }} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="p-2 border-top d-flex gap-1">
                                    <input
                                        className="form-control form-control-sm"
                                        placeholder="New list name…"
                                        value={newName}
                                        maxLength={40}
                                        disabled={state.lists.length >= MAX_LISTS}
                                        onChange={(e) => setNewName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-primary"
                                        onClick={handleCreate}
                                        disabled={!newName.trim() || state.lists.length >= MAX_LISTS}
                                        title={state.lists.length >= MAX_LISTS ? `Maximum ${MAX_LISTS} lists` : 'Create list'}
                                    >
                                        <i className="fas fa-plus" />
                                    </button>
                                </div>
                            </div>

                            {/* ── Items in the selected list ── */}
                            <div className="col-7">
                                <div className="p-2 border-bottom bg-light small text-muted d-flex justify-content-between">
                                    <span className="text-truncate">{selected.name}</span>
                                    <span>{selected.items.length}/{MAX_ITEMS_PER_LIST}</span>
                                </div>

                                {selected.items.length === 0 ? (
                                    <div className="p-3 text-muted small">
                                        Nothing pinned here yet. Pin products from the search box
                                        <i className="fas fa-thumbtack mx-1" style={{ fontSize: 10 }}></i>
                                        or move them across from another list.
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        {selected.items.map((entry, i) => {
                                            const k = entryKeyOf(entry);
                                            return (
                                                <div key={k} className="px-2 py-1 border-bottom d-flex align-items-center gap-2">
                                                    <span
                                                        className="d-flex align-items-center justify-content-center bg-white border rounded"
                                                        style={{ width: 26, height: 26, flexShrink: 0, overflow: 'hidden' }}
                                                    >
                                                        {entry.thumb ? (
                                                            <img src={entry.thumb} alt=""
                                                                 style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                 onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                                        ) : (
                                                            <i className="fas fa-box text-muted" style={{ fontSize: 10, opacity: 0.4 }}></i>
                                                        )}
                                                    </span>
                                                    <span className="flex-grow-1" style={{ minWidth: 0 }}>
                                                        <span className="d-block text-truncate small">{entry.name}</span>
                                                        {entry.price != null && (
                                                            <small className="text-muted">
                                                                {currency}{Number(entry.price || 0).toFixed(2)}
                                                            </small>
                                                        )}
                                                    </span>

                                                    <button type="button" className="btn btn-sm btn-link text-muted p-0 px-1"
                                                            title="Move up" disabled={i === 0}
                                                            onClick={() => apply(() => moveEntryWithin(branch, desk, selected.id, k, -1))}>
                                                        <i className="fas fa-chevron-up" style={{ fontSize: 10 }} />
                                                    </button>
                                                    <button type="button" className="btn btn-sm btn-link text-muted p-0 px-1"
                                                            title="Move down" disabled={i === selected.items.length - 1}
                                                            onClick={() => apply(() => moveEntryWithin(branch, desk, selected.id, k, 1))}>
                                                        <i className="fas fa-chevron-down" style={{ fontSize: 10 }} />
                                                    </button>

                                                    {otherLists.length > 0 && (
                                                        <select
                                                            className="form-select form-select-sm"
                                                            style={{ width: 108 }}
                                                            value=""
                                                            title="Move to another list"
                                                            onChange={(e) => {
                                                                const to = e.target.value;
                                                                if (to) apply(() => moveEntry(branch, desk, selected.id, to, k));
                                                            }}
                                                        >
                                                            <option value="">Move to…</option>
                                                            {otherLists.map(l => (
                                                                <option key={l.id} value={l.id}>{l.name}</option>
                                                            ))}
                                                        </select>
                                                    )}

                                                    <button type="button" className="btn btn-sm btn-link text-danger p-0 px-1"
                                                            title="Unpin"
                                                            onClick={() => apply(() => removeEntry(branch, desk, selected.id, k))}>
                                                        <i className="fas fa-times" style={{ fontSize: 11 }} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="modal-footer py-2">
                        <span className="small text-muted me-auto">
                            <i className="fas fa-circle text-success me-1" style={{ fontSize: 6, verticalAlign: 'middle' }} />
                            marks the list shown on the quick-add rail — switch it from the rail itself.
                        </span>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>Done</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
