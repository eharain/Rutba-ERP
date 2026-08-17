// Server-resolved navigation tree. The Strapi menu service flattens the
// polymorphic menu-item link targets into { label, href } nodes, so the
// storefront never deals with the raw relation populate.

export type MenuPosition = "top" | "side" | "footer";

export type MenuItemKind =
  | "cms_page"
  | "page_group"
  | "product_group"
  | "collection"
  | "url"
  | "mega";

export interface MenuMegaBrand {
  name: string;
  slug: string;
  logo?: string | null;
}

export interface MenuMegaCategory {
  name: string;
  slug: string;
  short_description?: string | null;
}

export interface MenuItemInterface {
  label: string;
  kind?: MenuItemKind;
  /** Resolved storefront href; null for `mega` items (which render a panel). */
  href?: string | null;
  openInNew?: boolean;
  image?: string | null;
  // Populated only for `mega` items — drive the Explore Brands / Products flyouts.
  brands?: MenuMegaBrand[];
  categories?: MenuMegaCategory[];
  children?: MenuItemInterface[];
}

export interface MenuInterface {
  name: string;
  slug: string;
  title?: string | null;
  position: MenuPosition;
  /** Explicitly marked as the default occupier of its position → applied to
   *  every page that doesn't assign its own menu for the position. */
  isDefault?: boolean;
  /** True when the menu has no page assignments → site-wide default for its position. */
  global?: boolean;
  /** Slugs of the pages this menu is assigned to (empty when global). */
  pageSlugs?: string[];
  items: MenuItemInterface[];
}

/** Lightweight per-page menu assignment carried on a CMS page detail. */
export interface PageMenuRef {
  slug: string;
  position: MenuPosition;
}
