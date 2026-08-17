import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

import NextImage from "@/components/next-image";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import {
  MenuItemInterface,
  MenuMegaBrand,
  MenuMegaCategory,
} from "@/types/api/menu";

function isExternal(href?: string | null) {
  return !!href && /^https?:\/\//i.test(href);
}

/** True when the item expands into a panel (has children or mega content). */
function hasPanel(item: MenuItemInterface) {
  if (item.kind === "mega") {
    return (item.brands?.length ?? 0) > 0 || (item.categories?.length ?? 0) > 0;
  }
  return (item.children?.length ?? 0) > 0;
}

/** Internal Link / external anchor, picked from the resolved href + openInNew. */
export function MenuLink({
  item,
  className,
  children,
  onClick,
}: {
  item: MenuItemInterface;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  const href = item.href || "#";
  if (isExternal(href) || item.openInNew) {
    return (
      <a
        href={href}
        target={item.openInNew ? "_blank" : undefined}
        rel={item.openInNew ? "noopener noreferrer" : undefined}
        className={className}
        onClick={onClick}
      >
        {children ?? item.label}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children ?? item.label}
    </Link>
  );
}

function MegaBrandGrid({
  brands,
  onNavigate,
}: {
  brands: MenuMegaBrand[];
  onNavigate?: () => void;
}) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
      {brands.map((b) => (
        <li key={"mega-brand-" + b.slug}>
          <Link
            className="px-3 py-2.5 flex items-center rounded-md hover:bg-secondary transition-colors"
            href={`/product?brand=${b.slug}`}
            onClick={onNavigate}
          >
            <div className="h-8 w-8 flex items-center justify-center rounded-full bg-secondary overflow-hidden mr-3 shrink-0">
              <NextImage
                src={resolveMediaUrl(b.logo ?? "")}
                width={32}
                height={32}
                useSkeleton
                alt={b.name}
              />
            </div>
            <p className="text-sm font-medium truncate">{b.name}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MegaCategoryGrid({
  categories,
  onNavigate,
}: {
  categories: MenuMegaCategory[];
  onNavigate?: () => void;
}) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
      {categories.map((c) => (
        <li key={"mega-category-" + c.slug}>
          <Link
            className="group p-3 flex items-center justify-between rounded-md hover:bg-secondary transition-colors"
            href={`/product?category=${c.slug}`}
            onClick={onNavigate}
          >
            <div className="min-w-0">
              <p className="font-semibold text-sm group-hover:text-brand transition-colors truncate">
                {c.name}
              </p>
              {c.short_description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {c.short_description}
                </p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ChildGrid({
  items,
  onNavigate,
}: {
  items: MenuItemInterface[];
  onNavigate?: () => void;
}) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
      {items.map((child, i) => (
        <li key={(child.href ?? child.label) + i}>
          <MenuLink
            item={child}
            onClick={onNavigate}
            className="group px-3 py-2.5 flex items-center rounded-md hover:bg-secondary transition-colors"
          >
            {child.image && (
              <span className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary overflow-hidden mr-2.5 shrink-0">
                <NextImage
                  src={resolveMediaUrl(child.image)}
                  width={28}
                  height={28}
                  useSkeleton
                  alt={child.label}
                />
              </span>
            )}
            <span className="text-sm font-medium group-hover:text-brand transition-colors truncate">
              {child.label}
            </span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
          </MenuLink>
        </li>
      ))}
    </ul>
  );
}

function AccordionPanel({
  item,
  onNavigate,
}: {
  item: MenuItemInterface;
  onNavigate?: () => void;
}) {
  if (item.kind === "mega") {
    return (
      <div className="space-y-3">
        {item.categories && item.categories.length > 0 && (
          <MegaCategoryGrid categories={item.categories} onNavigate={onNavigate} />
        )}
        {item.brands && item.brands.length > 0 && (
          <MegaBrandGrid brands={item.brands} onNavigate={onNavigate} />
        )}
      </div>
    );
  }
  return <ChildGrid items={item.children ?? []} onNavigate={onNavigate} />;
}

/**
 * Top navigation rendered as an in-flow accordion: clicking an item that has a
 * panel expands its children full-width directly beneath the trigger row,
 * pushing the page content down (no floating popover). The panel is sticky —
 * it stays open until the same trigger is clicked again, another is opened, a
 * link is followed, or the user clicks outside the menu.
 */
export default function TopMenu({ items }: { items: MenuItemInterface[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openIndex]);

  if (!items || items.length === 0) return null;

  const active = openIndex !== null ? items[openIndex] : null;
  const close = () => setOpenIndex(null);

  return (
    <div ref={ref} className="hidden md:block">
      <ul className="flex flex-wrap items-center gap-0.5 py-1">
        {items.map((item, i) => {
          if (!hasPanel(item)) {
            return (
              <li key={"mi-" + i}>
                <MenuLink
                  item={item}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md hover:bg-secondary hover:text-brand transition-colors"
                />
              </li>
            );
          }

          const open = openIndex === i;
          return (
            <li key={"mi-" + i}>
              <button
                type="button"
                aria-expanded={open ? "true" : "false"}
                onClick={() => setOpenIndex(open ? null : i)}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md transition-colors hover:bg-secondary hover:text-brand",
                  open && "bg-secondary text-brand"
                )}
              >
                {item.label}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    open && "rotate-180"
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {active && hasPanel(active) && (
        <div className="border-t border-border pt-3 pb-4">
          <AccordionPanel item={active} onNavigate={close} />
        </div>
      )}
    </div>
  );
}
