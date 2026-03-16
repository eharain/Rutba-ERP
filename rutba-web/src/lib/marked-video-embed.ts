/**
 * Marked extension that converts standalone video URLs and ::video directives
 * into responsive embedded iframes.  Supports YouTube, Vimeo, Dailymotion,
 * TikTok, Facebook and Instagram video links.
 *
 * Syntax:
 *   Bare URL on its own line  (full-width, no overlay):
 *     https://www.youtube.com/watch?v=abc123
 *
 *   Directive with options  (size + overlay thumbnail):
 *     ::video[https://www.youtube.com/watch?v=abc123]{size="medium" overlay="https://example.com/thumb.jpg"}
 */

// No type import needed — the return satisfies MarkedExtension structurally

interface VideoProvider {
  pattern: RegExp;
  embed: (id: string, url?: string) => string;
  type?: string;
}

const VIDEO_PROVIDERS: VideoProvider[] = [
  {
    pattern:
      /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/,
    embed: (id) => `https://www.youtube.com/embed/${id}`,
  },
  {
    pattern: /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/,
    embed: (id) => `https://player.vimeo.com/video/${id}`,
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?dailymotion\.com\/video\/([\w-]+)/,
    embed: (id) => `https://www.dailymotion.com/embed/video/${id}`,
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
    embed: (id) => `https://www.tiktok.com/embed/v2/${id}`,
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?(?:facebook\.com\/(?:watch\/?\?v=|[\w.]+\/videos\/)|fb\.watch\/)([\w-]+)/,
    embed: (_id, url) =>
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url!)}&show_text=false`,
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/([\w-]+)/,
    embed: (id) => `https://www.instagram.com/p/${id}/embed`,
  },
  {
    // Twitter / X  – twitter.com/user/status/ID  |  x.com/user/status/ID
    pattern:
      /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[\w]+\/status\/(\d+)/,
    embed: (id) => `https://platform.twitter.com/embed/Tweet.html?id=${id}`,
    type: "tweet",
  },
];

const SIZE_MAP: Record<string, string> = {
  small: "400px",
  medium: "640px",
  large: "960px",
  full: "100%",
};

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildIframe(src: string, maxWidth: string) {
  const widthStyle =
    maxWidth && maxWidth !== "100%"
      ? `max-width:${maxWidth};margin-left:auto;margin-right:auto;`
      : "max-width:100%;";
  return (
    `<div style="${widthStyle}margin-top:1em;margin-bottom:1em">` +
    '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden">' +
    `<iframe src="${escapeHtml(src)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" ` +
    'allowfullscreen loading="lazy"></iframe>' +
    "</div></div>"
  );
}

function buildTweetEmbed(src: string, maxWidth: string) {
  const mw = maxWidth && maxWidth !== "100%" ? maxWidth : "550px";
  return (
    `<div style="max-width:${mw};margin:1em auto">` +
    `<iframe src="${escapeHtml(src)}" ` +
    'style="width:100%;border:0;border-radius:12px" ' +
    'height="600" loading="lazy" scrolling="no"></iframe>' +
    "</div>"
  );
}

function buildOverlayPlayer(
  embedSrc: string,
  overlayUrl: string,
  maxWidth: string
) {
  const widthStyle =
    maxWidth && maxWidth !== "100%"
      ? `max-width:${maxWidth};margin-left:auto;margin-right:auto;`
      : "max-width:100%;";
  const escapedSrc = escapeHtml(embedSrc);
  const escapedOverlay = escapeHtml(overlayUrl);

  const onClickHandler =
    `var c=this.parentElement;` +
    `c.innerHTML='<div style=\\"position:relative;padding-bottom:56.25%;height:0;overflow:hidden\\"><iframe src=\\"${escapedSrc}?autoplay=1\\" style=\\"position:absolute;top:0;left:0;width:100%;height:100%;border:0\\" allowfullscreen></iframe></div>';`;

  return (
    `<div style="${widthStyle}margin-top:1em;margin-bottom:1em">` +
    '<div style="position:relative;cursor:pointer;line-height:0" ' +
    `onclick="${onClickHandler}">` +
    `<img src="${escapedOverlay}" alt="Video thumbnail" ` +
    'style="width:100%;display:block;border-radius:6px" ' +
    `onerror="this.style.display='none'" />` +
    '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    "width:68px;height:68px;background:rgba(0,0,0,0.65);border-radius:50%;" +
    'display:flex;align-items:center;justify-content:center;transition:background 0.2s" ' +
    "onmouseover=\"this.style.background='rgba(0,0,0,0.8)'\" " +
    "onmouseout=\"this.style.background='rgba(0,0,0,0.65)'\">" +
    '<div style="width:0;height:0;border-top:14px solid transparent;' +
    'border-bottom:14px solid transparent;border-left:22px solid #fff;margin-left:5px"></div>' +
    "</div>" +
    "</div></div>"
  );
}

function matchVideoUrl(href: string) {
  for (const provider of VIDEO_PROVIDERS) {
    const m = href.match(provider.pattern);
    if (m) return { provider, id: m[1], url: href };
  }
  return null;
}

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

export function markedVideoEmbed() {
  return {
    extensions: [
      // ::video[URL]{size="medium" overlay="..."}
      {
        name: "videoDirective",
        level: "block" as const,
        start(src: string) {
          return src.match(/^::video\[/)?.index;
        },
        tokenizer(src: string) {
          const match = src.match(
            /^::video\[([^\]]+)\](?:\{([^}]*)\})?(?:\n|$)/
          );
          if (!match) return undefined;
          const href = match[1].trim();
          const hit = matchVideoUrl(href);
          if (!hit) return undefined;
          const attrs = match[2] ? parseAttrs(match[2]) : {};
          return {
            type: "videoDirective",
            raw: match[0],
            href,
            providerId: hit.id,
            provider: hit.provider,
            size: attrs.size || "full",
            overlay: attrs.overlay || "",
          };
        },
        renderer(token: any) {
          const embedSrc = token.provider.embed(
            token.providerId,
            token.href
          );
          const maxWidth = SIZE_MAP[token.size] || "100%";
          if (token.provider.type === "tweet") {
            return buildTweetEmbed(embedSrc, maxWidth);
          }
          if (token.overlay) {
            return buildOverlayPlayer(embedSrc, token.overlay, maxWidth);
          }
          return buildIframe(embedSrc, maxWidth);
        },
      },
      // Bare URL on its own line (backward-compatible)
      {
        name: "videoEmbed",
        level: "block" as const,
        start(src: string) {
          return src.match(/^https?:\/\//)?.index;
        },
        tokenizer(src: string) {
          const match = src.match(/^(https?:\/\/[^\s]+)(?:\n|$)/);
          if (!match) return undefined;
          const hit = matchVideoUrl(match[1]);
          if (!hit) return undefined;
          return {
            type: "videoEmbed",
            raw: match[0],
            href: match[1],
            providerId: hit.id,
            provider: hit.provider,
          };
        },
        renderer(token: any) {
          const src = token.provider.embed(
            token.providerId,
            token.href
          );
          if (token.provider.type === "tweet") {
            return buildTweetEmbed(src, "100%");
          }
          return buildIframe(src, "100%");
        },
      },
    ],
  };
}
