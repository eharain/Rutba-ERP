import NextImage from "@/components/next-image";
import { IMAGE_URL } from "@/static/const";
import { ImageInterface } from "@/types/api/image";
import { ProductInterface } from "@/types/api/product";
import { cn } from "@/lib/utils";

import { useMemo, useEffect, useState, useCallback } from "react";

interface ImageEntry {
  image: ImageInterface;
  variantId: number | null;
}

export default function ImageListProduct({
  logo,
  imageList,
  variants,
  selectedVariantId,
  onVariantSelect,
  onImageChange,
}: {
  logo?: ImageInterface;
  imageList?: ImageInterface[];
  variants?: ProductInterface[];
  selectedVariantId?: number | null;
  onVariantSelect?: (variantId: number) => void;
  onImageChange?: (relativeUrl: string | null) => void;
}) {
  const allEntries = useMemo(() => {
    const entries: ImageEntry[] = [];
    const usedIds = new Set<number>();

    if (logo) {
      entries.push({ image: logo, variantId: null });
      usedIds.add(logo.id);
    }

    if (imageList) {
      imageList.forEach((img) => {
        if (!usedIds.has(img.id)) {
          entries.push({ image: img, variantId: null });
          usedIds.add(img.id);
        }
      });
    }

    if (variants) {
      variants.forEach((variant) => {
        if (variant.logo && !usedIds.has(variant.logo.id)) {
          entries.push({ image: variant.logo, variantId: variant.id });
          usedIds.add(variant.logo.id);
        }
        if (variant.gallery) {
          variant.gallery.forEach((img) => {
            if (!usedIds.has(img.id)) {
              entries.push({ image: img, variantId: variant.id });
              usedIds.add(img.id);
            }
          });
        }
      });
    }

    return entries;
  }, [logo, imageList, variants]);

  const [selectedImage, setSelectedImage] = useState(
    allEntries[0]?.image?.url
      ? IMAGE_URL + allEntries[0].image.url
      : "/images/fallback-image.png"
  );

  // Notify parent whenever the displayed image changes
  useEffect(() => {
    if (onImageChange) {
      if (selectedImage.startsWith(IMAGE_URL)) {
        onImageChange(selectedImage.slice(IMAGE_URL.length));
      } else {
        onImageChange(null);
      }
    }
  }, [selectedImage, onImageChange]);

  // When a variant is selected externally, jump to its first image
  useEffect(() => {
    if (selectedVariantId != null) {
      const variantEntry = allEntries.find(
        (e) => e.variantId === selectedVariantId
      );
      if (variantEntry) {
        setSelectedImage(IMAGE_URL + variantEntry.image.url);
      }
    }
  }, [selectedVariantId]);

  function handleImageSelect(entry: ImageEntry) {
    setSelectedImage(IMAGE_URL + entry.image.url);
    if (entry.variantId != null && onVariantSelect) {
      onVariantSelect(entry.variantId);
    }
  }

  return (
    <div className="flex flex-col-reverse md:flex-row gap-5 sticky top-5">
      <div className="flex flex-row md:flex-col gap-2 md:gap-5 flex-wrap">
        {allEntries.map((entry) => {
          const isActive =
            selectedImage === IMAGE_URL + entry.image.url;
          const isVariantImg = entry.variantId != null;
          const belongsToSelected = entry.variantId === selectedVariantId;

          return (
            <NextImage
              key={"image-product-" + entry.image.id}
              onClick={() => handleImageSelect(entry)}
              onMouseEnter={() =>
                setSelectedImage(IMAGE_URL + entry.image.url)
              }
              src={IMAGE_URL + entry.image.url}
              height={100}
              width={100}
              className={cn(
                "border w-[calc(100%/3-8px)] md:w-full object-cover aspect-square cursor-pointer",
                isActive
                  ? "border-black ring-2 ring-black"
                  : "hover:border-black",
                isVariantImg && !belongsToSelected && selectedVariantId != null
                  ? "opacity-50"
                  : ""
              )}
              alt="product"
            />
          );
        })}
      </div>
      <NextImage
        src={selectedImage}
        height={1000}
        width={1000}
        className="w-full rounded-xl"
        alt="product"
      />
    </div>
  );
}
