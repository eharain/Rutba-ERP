import { useQuery } from "@tanstack/react-query";
// Direct service import (not the @/services barrel) to keep this hook's
// dependency cone small — same reasoning as use-site-settings.
import { createWebMenusService } from "@/services/menus";
import { MenuInterface, MenuPosition, PageMenuRef } from "@/types/api/menu";

const menusService = createWebMenusService();

export const MENUS_QUERY_KEY = ["menus"] as const;

/** All enabled menus (every position), fetched once and cached for the session. */
export function useMenus(): MenuInterface[] {
  const { data } = useQuery({
    queryKey: MENUS_QUERY_KEY,
    queryFn: () => menusService.getMenus(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? [];
}

/**
 * Resolve the menu for a position, honouring per-page assignments:
 *   1. a menu assigned to this page (by slug) for the position — the page
 *      "occupies" the position, so the default does not apply, else
 *   2. the menu explicitly marked as default for that position, else
 *   3. the site-wide default (a `global` menu of that position), else
 *   4. the first menu of that position.
 * `pageMenus` is the current page's `menus` (slug + position); omit for
 * non-CMS routes to always get the default.
 */
export function pickMenuForPosition(
  menus: MenuInterface[],
  position: MenuPosition,
  pageMenus?: PageMenuRef[],
): MenuInterface | undefined {
  const assigned = (pageMenus ?? []).find((m) => m.position === position);
  if (assigned) {
    const full = menus.find((m) => m.slug === assigned.slug);
    if (full) return full;
  }
  return (
    menus.find((m) => m.position === position && m.isDefault) ??
    menus.find((m) => m.position === position && m.global) ??
    menus.find((m) => m.position === position)
  );
}

/** The site-wide menu for a position (no per-page override). */
export function useMenu(position: MenuPosition): MenuInterface | undefined {
  const menus = useMenus();
  return pickMenuForPosition(menus, position);
}

/** The menu for a position given the current page's assignments. */
export function usePageMenu(
  position: MenuPosition,
  pageMenus?: PageMenuRef[],
): MenuInterface | undefined {
  const menus = useMenus();
  return pickMenuForPosition(menus, position, pageMenus);
}
