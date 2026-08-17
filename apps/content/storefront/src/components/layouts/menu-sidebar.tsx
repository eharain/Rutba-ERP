import Link from "next/link";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MenuInterface, MenuItemInterface } from "@/types/api/menu";
import { MenuLink } from "./top-menu";
import { cn } from "@/lib/utils";

function LeafRow({ item }: { item: MenuItemInterface }) {
  return (
    <MenuLink
      item={item}
      className="block px-3 py-2.5 rounded-md text-sm font-medium hover:bg-secondary hover:text-brand transition-colors"
    />
  );
}

function GroupBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-[0.18em] font-bold text-muted-foreground">
        {label}
      </p>
      <div className={cn("pl-2 border-l border-border ml-3")}>{children}</div>
    </div>
  );
}

function SideMenuItems({ items }: { items: MenuItemInterface[] }) {
  return (
    <nav className="flex flex-col">
      {items.map((item, i) => {
        if (item.kind === "mega" && ((item.brands?.length ?? 0) > 0 || (item.categories?.length ?? 0) > 0)) {
          return (
            <GroupBlock key={"si-" + i} label={item.label}>
              {(item.categories ?? []).map((c) => (
                <Link
                  key={"c-" + c.slug}
                  href={`/product?category=${c.slug}`}
                  className="block px-3 py-2 rounded-md text-sm hover:bg-secondary hover:text-brand transition-colors"
                >
                  {c.name}
                </Link>
              ))}
              {(item.brands ?? []).map((b) => (
                <Link
                  key={"b-" + b.slug}
                  href={`/product?brand=${b.slug}`}
                  className="block px-3 py-2 rounded-md text-sm hover:bg-secondary hover:text-brand transition-colors"
                >
                  {b.name}
                </Link>
              ))}
            </GroupBlock>
          );
        }

        if (item.children && item.children.length > 0) {
          return (
            <GroupBlock key={"si-" + i} label={item.label}>
              {item.children.map((child, j) => (
                <LeafRow key={"sc-" + j} item={child} />
              ))}
            </GroupBlock>
          );
        }

        return <LeafRow key={"si-" + i} item={item} />;
      })}
    </nav>
  );
}

export default function MenuSidebar({
  menu,
  trigger,
}: {
  menu: MenuInterface;
  trigger: React.JSX.Element;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="left" className="flex h-full flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{menu.title || menu.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-2">
          <SideMenuItems items={menu.items} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
