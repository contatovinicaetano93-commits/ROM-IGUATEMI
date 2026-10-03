import type { Category } from "@/lib/flow/types";

/** Resolve stored category (id or legacy name) to display name. */
export function categoryLabel(categories: Category[], value: string): string {
  return categories.find((item) => item.id === value || item.name === value)?.name ?? value;
}
