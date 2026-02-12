import Image from "next/image";
import { IMAGE_URL } from "../lib/api";

/**
 * StrapiImage component
 *
 * @param {object} props.media - Strapi media object
 * @param {string} [props.format="medium"] - Preferred format ("thumbnail", "small", "medium", "large", etc.)
 * @param {string} [props.baseUrl=IMAGE_URL] - Base URL of Strapi server (required if media.url is relative)
 * @param {object} [props.imgProps] - Extra props passed to Next.js Image
 * @param {number} [props.maxWidth] - Maximum allowed width
 * @param {number} [props.maxHeight] - Maximum allowed height
 */
export default function StrapiImage({
    media,
    format = "medium",
    baseUrl = IMAGE_URL,
    imgProps = {},
    maxWidth = 200,
    maxHeight = 200,
}) {
    if (!media) return null;

    // Pick preferred format, fallback to original
    const chosen =
        media.formats?.[format] ||
        media.formats?.large ||
        media.formats?.medium ||
        media.formats?.small ||
        media.formats?.thumbnail ||
        media;

    const src = chosen.url.startsWith("http") ? chosen.url : `${baseUrl}${chosen.url}`;
    const alt = media.alternativeText || media.name || "";

    // Original size
    let width = chosen.width;
    let height = chosen.height;

    // Compute scale factor to fit inside maxWidth x maxHeight
    const scale = Math.min(maxWidth / width, maxHeight / height, 1);

    width = Math.round(width * scale);
    height = Math.round(height * scale);

    return (
        <div
            style={{
                width: maxWidth,
                height: maxHeight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                background: "#f9f9f9", // optional background
            }}
        >
            <Image
                src={src}
                alt={alt}
                width={width}
                height={height}
                style={{ objectFit: "contain" }}
                {...imgProps}
            />
        </div>
    );
}

export function getStrapiMedia(url) {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return `${process.env.NEXT_PUBLIC_STRAPI_URL}${url}`;
}
