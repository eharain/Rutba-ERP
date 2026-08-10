// Live folder list for one account. Depth comes from the IMAP delimiter;
// special-use folders get their conventional icons and sort first.

const SPECIAL_ICONS = {
    "\\Inbox": "fa-inbox",
    "\\Sent": "fa-paper-plane",
    "\\Drafts": "fa-file-pen",
    "\\Trash": "fa-trash",
    "\\Junk": "fa-ban",
    "\\Archive": "fa-box-archive",
};

const SPECIAL_ORDER = ["\\Inbox", "\\Drafts", "\\Sent", "\\Archive", "\\Junk", "\\Trash"];

function iconFor(folder) {
    if (folder.path.toUpperCase() === "INBOX") return "fa-inbox";
    return SPECIAL_ICONS[folder.specialUse] || "fa-folder";
}

function sortKey(folder) {
    if (folder.path.toUpperCase() === "INBOX") return "0";
    const idx = SPECIAL_ORDER.indexOf(folder.specialUse);
    return idx >= 0 ? `1${idx}` : `2${folder.path.toLowerCase()}`;
}

export default function FolderTree({ folders, activeFolder, unseenCounts, onSelect }) {
    const sorted = [...(folders || [])].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    return (
        <div className="py-2">
            {sorted.map((f) => {
                const depth = f.path.split(f.delimiter || "/").length - 1;
                const unseen = unseenCounts?.[f.path];
                return (
                    <div
                        key={f.path}
                        className={`mail-folder-item ${f.path === activeFolder ? "active" : ""}`}
                        style={{ paddingLeft: `${0.75 + depth * 0.9}rem` }}
                        title={f.path}
                        onClick={() => onSelect(f.path)}
                    >
                        <i className={`fa-solid ${iconFor(f)} text-muted`} style={{ width: "1rem" }}></i>
                        <span className="text-truncate flex-grow-1">{f.name || f.path}</span>
                        {Number(unseen) > 0 && <span className="badge bg-primary rounded-pill">{unseen}</span>}
                    </div>
                );
            })}
            {(!folders || folders.length === 0) && (
                <div className="text-muted small px-3 py-2">No folders.</div>
            )}
        </div>
    );
}
