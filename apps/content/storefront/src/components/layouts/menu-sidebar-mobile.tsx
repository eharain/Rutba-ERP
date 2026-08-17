import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Button } from "@/components/ui/button";
import SearchModal from "../search/search-modal";
import { ArrowUpRightSquare, FileText, Search, User2 } from "lucide-react";
import Link from "next/link";
import { CmsPageInterface } from "@/types/api/cms-page";
import { MenuItemInterface } from "@/types/api/menu";
import { getPageUrl } from "@/lib/cms-page-types";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";

export interface propsInterface {
  trigger: React.JSX.Element;
  pinnedPages?: CmsPageInterface[];
  /** Resolved CMS menu items (top + side). When present they replace the
   *  legacy pinned-pages list. */
  menuItems?: MenuItemInterface[];
}

function isExternal(href?: string | null) {
  return !!href && /^https?:\/\//i.test(href);
}

function MobileMenuLink({ item }: { item: MenuItemInterface }) {
  const href = item.href || "#";
  const className =
    "flex justify-start items-center gap-2 w-full rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary hover:text-brand transition-colors";
  if (isExternal(href) || item.openInNew) {
    return (
      <a
        href={href}
        target={item.openInNew ? "_blank" : undefined}
        rel={item.openInNew ? "noopener noreferrer" : undefined}
        className={className}
      >
        {item.label}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {item.label}
    </Link>
  );
}

function MobileMenuTree({ items }: { items: MenuItemInterface[] }) {
  return (
    <nav className="flex flex-col">
      {items.map((item, i) => {
        const children =
          item.kind === "mega"
            ? [
                ...(item.categories ?? []).map((c) => ({
                  label: c.name,
                  href: `/product?category=${c.slug}`,
                })),
                ...(item.brands ?? []).map((b) => ({
                  label: b.name,
                  href: `/product?brand=${b.slug}`,
                })),
              ]
            : (item.children ?? []).map((c) => ({ label: c.label, href: c.href, openInNew: c.openInNew }));

        if (children.length > 0) {
          return (
            <div key={"mm-" + i} className="mt-1">
              <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-[0.18em] font-bold text-muted-foreground">
                {item.label}
              </p>
              <div className="pl-2 border-l border-border ml-3">
                {children.map((c, j) => (
                  <MobileMenuLink key={"mmc-" + j} item={c as MenuItemInterface} />
                ))}
              </div>
            </div>
          );
        }
        return <MobileMenuLink key={"mm-" + i} item={item} />;
      })}
    </nav>
  );
}

export default function MenuSideBarMobile(props: propsInterface) {
  const pinnedPages = props.pinnedPages ?? [];
  const menuItems = props.menuItems ?? [];
  const settings = useSiteSettings();

  return (
    <Sheet>
      <SheetTrigger asChild>{props.trigger}</SheetTrigger>

      <SheetContent className="flex h-full flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex justify-start">
            {settings.site_logo?.url ? (
              <img
                src={resolveMediaUrl(settings.site_logo.url)}
                alt={settings.site_name}
                className="h-7 w-auto"
              />
            ) : (
              settings.site_name
            )}
          </SheetTitle>
        </SheetHeader>

        <SearchModal
          trigger={
            <Button variant={"secondary"} className="flex justify-start">
              <Search className="mr-2 h-5"></Search> {settings.nav_search_placeholder || "Search Products"}
            </Button>
          }
        ></SearchModal>

        <Button variant={"secondary"} className="flex justify-start" asChild>
          <Link href="/product">
            <ArrowUpRightSquare className="mr-2 h-5"></ArrowUpRightSquare>{settings.nav_explore_products_label || "Explore Products"}
          </Link>
        </Button>

        {menuItems.length > 0 ? (
          <MobileMenuTree items={menuItems} />
        ) : (
          pinnedPages.map((pp) => (
            <Button
              key={pp.documentId}
              variant={"secondary"}
              className="flex justify-start"
              asChild
            >
              <Link href={getPageUrl(pp)}>
                <FileText className="mr-2 h-5"></FileText>
                {pp.title}
              </Link>
            </Button>
          ))
        )}

        <Button className="flex justify-start" asChild>
          <Link href="/login">
            <User2 className="mr-2 h-5"></User2>{settings.nav_login_label || "Login or Register"}
          </Link>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
