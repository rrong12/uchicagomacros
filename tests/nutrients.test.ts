import { describe, it, expect } from "vitest";
import { parseNutrientValue, NUTRIENT_FIELDS } from "../src/domain/nutrients";

describe("parseNutrientValue", () => {
  it("parses a numeric string", () => {
    expect(parseNutrientValue("14")).toBe(14);
  });

  it("parses a decimal", () => {
    expect(parseNutrientValue("2.5")).toBe(2.5);
  });

  it("returns null for an empty string", () => {
    expect(parseNutrientValue("")).toBeNull();
  });

  it("returns null for null and undefined", () => {
    expect(parseNutrientValue(null)).toBeNull();
    expect(parseNutrientValue(undefined)).toBeNull();
  });

  it("returns null for prose, rather than NaN or 0", () => {
    expect(parseNutrientValue("less than 1 gram")).toBeNull();
  });

  it("does not treat a missing value as zero", () => {
    expect(parseNutrientValue("")).not.toBe(0);
  });
});

describe("NUTRIENT_FIELDS", () => {
  it("maps the four macros we sort by", () => {
    expect(NUTRIENT_FIELDS["Calories"]).toBe("calories");
    expect(NUTRIENT_FIELDS["Protein (g)"]).toBe("protein_g");
    expect(NUTRIENT_FIELDS["Total Fat (g)"]).toBe("fat_g");
    expect(NUTRIENT_FIELDS["Total Carbohydrates (g)"]).toBe("carbs_g");
  });
});
