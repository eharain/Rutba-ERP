import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import NextImage from "@/components/next-image";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  MenuItemInterface,
  MenuMegaBrand,
  MenuMegaCategory,
} from "@/types/api/menu";

function isExternal(href?: string | null) {
  return !!href && /^https?:\/\//i.test(href);
}

/** Internal Link / external anchor, picked from the resolved href + openInNew. */
export function MenuLink({
  item,
  className,
  children,
}: {
  item: MenuItemInterface;
  className?: string;
  children?: React.ReactNode;
}) {
  const href = item.href || "#";
  if (isExternal(href) || item.openInNew) {
    return (
      <a
        href={href}
        target={item.openInNew ? "_blank" : undefined}
        rel={item.openInNew ? "noopener noreferrer" : undefined}
        className={className}
      >
        {children ?? item.label}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children ?? item.label}
    </Link>
  );
}

function MegaBrandPanel({ brands }: { brands: MenuMegaBrand[] }) {
  return (
    <ul className="grid w-[240px] p-1.5">
      {brands.map((b) => (
        <li key={"mega-brand-" + b.slug}>
          <Link
            className="px-3 py-2.5 flex items-center rounded-md hover:bg-secondary transition-colors"
            href={`/product?brand=${b.slug}`}
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
            <p className="text-sm font-medium">{b.name}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MegaCategoryPanel({ categories }: { categories: MenuMegaCategory[] }) {
  return (
    <ul className="grid w-[420px] p-1.5">
      {categories.map((c) => (
        <li key={"mega-category-" + c.slug}>
          <Link
            className="group p-3.5 flex items-center justify-between rounded-md hover:bg-secondary transition-colors"
            href={`/product?category=${c.slug}`}
          >
            <div className="min-w-0">
              <p className="font-semibold text-sm group-hover:text-brand transition-colors">
                {c.name}
              </p>
              {c.short_description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {c.short_description}
                </p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ChildList({ items }: { items: MenuItemInterface[] }) {
  return (
    <ul className="grid w-[260px] p-1.5">
      {items.map((child, i) => (
        <li key={(child.href ?? child.label) + i}>
          <MenuLink
            item={child}
            className="group px-3 py-2.5 flex items-center justify-between rounded-md hover:bg-secondary transition-colors"
          >
            <span className="flex items-center min-w-0">
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
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-brand group-hover:translate-x-0.5 transition-all shrink-0" />
          </MenuLink>
        </li>
      ))}
    </ul>
  );
}

export default function TopMenu({ items }: { items: MenuItemInterface[] }) {
  if (!items || items.length === 0) return null;

  return (
    <NavigationMenu className="hidden md:block">
      <NavigationMenuList className="gap-0.5">
        {items.map((item, i) => {
          // Mega flyout — Explore Products / Brands panels.
          if (item.kind === "mega" && ((item.brands?.length ?? 0) > 0 || (item.categories?.length ?? 0) > 0)) {
            return (
              <NavigationMenuItem key={"mi-" + i}>
                <NavigationMenuTrigger className="text-sm font-medium hover:text-brand data-[state=open]:text-brand">
                  {item.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  {item.categories && item.categories.length > 0 ? (
                    <MegaCategoryPanel categories={item.categories} />
                  ) : (
                    <MegaBrandPanel brands={item.brands ?? []} />
                  )}
                </NavigationMenuContent>
              </NavigationMenuItem>
            );
          }

          // Dropdown — item with children.
          if (item.children && item.children.length > 0) {
            return (
              <NavigationMenuItem key={"mi-" + i}>
                <NavigationMenuTrigger className="text-sm font-medium hover:text-brand data-[state=open]:text-brand">
                  {item.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ChildList items={item.children} />
                </NavigationMenuContent>
              </NavigationMenuItem>
            );
          }

          // Leaf link.
          return (
            <NavigationMenuItem key={"mi-" + i}>
              <MenuLink
                item={item}
                className="px-4 py-2 text-sm font-medium hover:text-brand transition-colors"
              />
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
