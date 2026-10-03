import { describe, expect, it } from "vitest";
import { categoryLabel } from "@/lib/flow/category-label";
import type { Category } from "@/lib/flow/types";

const categories: Category[] = [
  { id: "cat_outros", name: "Outros", color: "#71717A", is_active: true },
  { id: "cat_viagem", name: "Viagem", color: "#6366F1", is_active: true },
];

describe("categoryLabel", () => {
  it("maps category id to name", () => {
    expect(categoryLabel(categories, "cat_outros")).toBe("Outros");
  });

  it("maps legacy stored name to name", () => {
    expect(categoryLabel(categories, "Viagem")).toBe("Viagem");
  });

  it("falls back to raw value when unknown", () => {
    expect(categoryLabel(categories, "cat_desconhecida")).toBe("cat_desconhecida");
  });
});
