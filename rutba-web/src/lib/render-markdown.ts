import { marked } from "marked";
import { markedVideoEmbed } from "@/lib/marked-video-embed";
import { markedCollapse } from "@/lib/marked-collapse";
import { IMAGE_URL } from "@/static/const";

marked.use({ breaks: true, gfm: true });
marked.use(markedVideoEmbed({ imageBaseUrl: IMAGE_URL }));
marked.use(markedCollapse());

/**
 * Repair markdown that's been flattened onto a single line.
 *
 * AI-assisted SEO scripts and the "optimized" Excel exports often emit body
 * text where headings and bullet-list items run inline with surrounding prose,
 * e.g.:
 *
 *   "### Acrylic Dior Handbag - 6 Premium fashion wear from **R. by Rutba.pk** - **Product Code:** `dior` - **Brand:** R."
 *
 * `marked` only recognises `#`-headings and `-`-bullets when they sit at the
 * start of a line, so the snippet above renders as one big paragraph with
 * literal `###` and ` - ` visible. We restore the missing line breaks for the
 * two patterns that show up in the real data:
 *
 *   1. ATX heading markers (`#` … `######`) that appear mid-line → prefix
 *      with `\n\n` so `marked` treats them as a heading block.
 *   2. ` - **Field:**` (bullet-with-bold-label) that appears mid-line →
 *      prefix with `\n` so each becomes its own list item. Plain ` - ` is
 *      left alone because it commonly occurs in body text ("R. - Rutba.pk").
 */
export function normalizeMarkdown(input: string | null | undefined): string {
    if (input == null) return "";
    let out = String(input);
    if (!out) return "";
    // Mid-line ATX headings: `text### Heading` → `text\n\n### Heading`
    out = out.replace(/([^\n])(#{1,6} )/g, "$1\n\n$2");
    // Mid-line bullet-with-bold-label: `prose - **Label:**` → `prose\n- **Label:**`
    out = out.replace(/([^\n])\s-\s(\*\*[^*]+:\*\*)/g, "$1\n- $2");
    // Video directive `::video[url]{attrs}` — the tokenizer is anchored to
    // ^...$ so it only fires when the directive sits on its own line. Insert
    // blank lines around any inline occurrence so the embed renders.
    out = out.replace(/([^\n])(::video\[)/g, "$1\n\n$2");
    out = out.replace(/(::video\[[^\]]+\](?:\{[^}]*\})?)([^\n])/g, "$1\n\n$2");
    // Collapsible fence `:::details` / `:::collapse` — opener must be at
    // column 0; nudge it onto its own line when authors paste it mid-paragraph.
    out = out.replace(
        /([^\n])(:::(?:details|collapse)(?:\+)?(?:\{[^}]*\})?(?:[ \t]|$))/g,
        "$1\n\n$2",
    );
    return out;
}

/**
 * Render a markdown string to HTML, normalising single-line input first.
 * Use this in JSX as `<div dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />`.
 */
export function renderMarkdown(input: string | null | undefined): string {
    if (input == null) return "";
    const normalised = normalizeMarkdown(input);
    return marked.parse(normalised) as string;
}
