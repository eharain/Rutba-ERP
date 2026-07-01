/**
 * Marked extension that adds collapsible <details>/<summary> sections.
 *
 * Syntax A — blockquote callout (pure markdown):
 *   > [!details] Heading
 *   > body lines, each prefixed with `> `
 *
 *   > [!details]+ Heading   (the `+` opens it by default)
 *   > body
 *
 * Syntax B — fenced container directive (preferred by most AI generators):
 *   :::details Heading
 *   body lines
 *   :::
 *
 *   :::collapse+ Heading                          (`+` for default-open)
 *   :::details{title="Adv." open=true}            (Pandoc-style attrs)
 *   :::details                                    (title-less)
 *   …
 *   :::
 *
 *   Nesting works — count `:::details`/`:::collapse` openers against bare
 *   `:::` closers.
 *
 * Raw <details>…</details> HTML also passes through marked unchanged.
 * Styles in globals.css cover all three forms.
 */

import { marked } from "marked";

const FENCE_HEADER_RE =
  /^:::(?:details|collapse)(\+)?(?:\{([^}]*)\})?[ \t]*([^\n]*)$/i;
const FENCE_OPEN_RE =
  /^:::(?:details|collapse)(?:\+)?(?:\{[^}]*\})?(?:[ \t]|$)/i;
const FENCE_CLOSE_RE = /^:::[ \t]*$/;

interface CollapsePayload {
  open: boolean;
  title: string;
  body: string;
}

interface CollapseToken extends CollapsePayload {
  type: "collapseCallout" | "collapseBlock";
  raw: string;
}

function parseAttrs(attrStr: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attrStr) return out;
  const re = /(\w+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "true";
  }
  return out;
}

function truthy(v: string | undefined): boolean {
  const s = String(v ?? "").toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "open";
}

function renderDetails({ open, title, body }: CollapsePayload): string {
  const titleHtml = title ? (marked.parseInline(title) as string) : "Details";
  const bodyHtml = body ? (marked.parse(body) as string) : "";
  const openAttr = open ? " open" : "";
  return (
    `<details class="md-collapse"${openAttr}>` +
    `<summary class="md-collapse-summary">${titleHtml}</summary>` +
    `<div class="md-collapse-body">${bodyHtml}</div>` +
    `</details>`
  );
}

export function markedCollapse() {
  return {
    extensions: [
      // Syntax A — `> [!details]` blockquote callout (pure markdown).
      {
        name: "collapseCallout",
        level: "block" as const,
        start(src: string) {
          return src.match(/^>[ \t]?\[!(?:details|collapse)\]/im)?.index;
        },
        tokenizer(src: string): CollapseToken | undefined {
          const match = src.match(
            /^>[ \t]?\[!(?:details|collapse)\]([+\-])?[ \t]*([^\n]*)\n((?:>[ \t]?[^\n]*\n?)*)/i,
          );
          if (!match) return undefined;
          const body = match[3].replace(/^>[ \t]?/gm, "");
          return {
            type: "collapseCallout",
            raw: match[0],
            open: match[1] === "+",
            title: match[2].trim(),
            body,
          };
        },
        renderer(token: CollapseToken) {
          return renderDetails(token);
        },
      },
      // Syntax B — `:::details` / `:::collapse` fenced container.
      // Walks line-by-line so nested fences and `{attr=…}` work.
      {
        name: "collapseBlock",
        level: "block" as const,
        start(src: string) {
          return src.match(/^:::(?:details|collapse)/im)?.index;
        },
        tokenizer(src: string): CollapseToken | undefined {
          const lines = src.split("\n");
          const header = lines[0].match(FENCE_HEADER_RE);
          if (!header) return undefined;
          let depth = 1;
          let endIdx = -1;
          for (let i = 1; i < lines.length; i++) {
            if (FENCE_OPEN_RE.test(lines[i])) depth++;
            else if (FENCE_CLOSE_RE.test(lines[i])) {
              depth--;
              if (depth === 0) {
                endIdx = i;
                break;
              }
            }
          }
          if (endIdx === -1) return undefined;
          const attrs = parseAttrs(header[2]);
          const title = attrs.title || header[3].trim();
          const open = header[1] === "+" || truthy(attrs.open);
          const consumed = lines.slice(0, endIdx + 1).join("\n");
          const raw =
            src.length > consumed.length ? consumed + "\n" : consumed;
          return {
            type: "collapseBlock",
            raw,
            open,
            title,
            body: lines.slice(1, endIdx).join("\n"),
          };
        },
        renderer(token: CollapseToken) {
          return renderDetails(token);
        },
      },
    ],
  };
}
