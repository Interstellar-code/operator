import type { JsonSchema } from "../types/agents";

/**
 * Returns the effective type string for a schema node.
 * Handles type arrays (filtering out "null"), anyOf/oneOf literal enums, etc.
 */
export function schemaType(schema: JsonSchema): string {
  // Check anyOf/oneOf for enum pattern (all variants have const)
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) {
    const nonNull = variants.filter(
      (v) => !(v.type === "null" || (typeof v.const === "object" && v.const === null)),
    );
    if (nonNull.length > 0 && nonNull.every((v) => "const" in v)) {
      return "enum";
    }
  }

  if (Array.isArray(schema.type)) {
    const filtered = schema.type.filter((t) => t !== "null");
    return filtered[0] ?? "unknown";
  }

  if (typeof schema.type === "string") {
    return schema.type;
  }

  return "unknown";
}

/**
 * Recursively normalizes a JSON Schema node for form rendering.
 * Strips nullable wrappers, converts anyOf/oneOf literal sets to enums,
 * and tracks unsupported patterns.
 */
export function normalizeSchemaNode(
  schema: JsonSchema,
  basePath: string[] = [],
): { schema: JsonSchema; unsupportedPaths: string[] } {
  const unsupportedPaths: string[] = [];
  const result = normalizeInner(schema, basePath, unsupportedPaths);
  return { schema: result, unsupportedPaths };
}

function normalizeInner(schema: JsonSchema, path: string[], unsupported: string[]): JsonSchema {
  let current = { ...schema };

  // Handle anyOf / oneOf
  const variants = current.anyOf ?? current.oneOf;
  if (variants) {
    const nonNull = variants.filter(
      (v) => !(v.type === "null" || (typeof v.const === "object" && v.const === null)),
    );

    // All remaining are literal const values -> convert to string enum
    if (nonNull.length > 0 && nonNull.every((v) => "const" in v)) {
      const enumValues = nonNull.map((v) => v.const);
      current = { ...current, type: "string", enum: enumValues };
      delete current.anyOf;
      delete current.oneOf;
    } else if (nonNull.length === 1) {
      // Single non-null variant: unwrap and recurse
      const inner = normalizeInner(nonNull[0], path, unsupported);
      current = { ...current, ...inner };
      delete current.anyOf;
      delete current.oneOf;
    } else if (nonNull.length > 1) {
      // Multiple non-null variants: check if all primitive types
      const allPrimitive = nonNull.every(
        (v) =>
          typeof v.type === "string" && ["string", "number", "integer", "boolean"].includes(v.type),
      );
      if (!allPrimitive) {
        unsupported.push(path.join(".") || "(root)");
      }
    }
  }

  // Normalize type arrays: ["string", "null"] -> "string"
  if (Array.isArray(current.type)) {
    const filtered = current.type.filter((t) => t !== "null");
    if (filtered.length === 1) {
      current = { ...current, type: filtered[0] };
    } else if (filtered.length > 1) {
      current = { ...current, type: filtered };
    }
  }

  // Recurse into properties
  if (current.properties) {
    const normalizedProps: Record<string, JsonSchema> = {};
    for (const [key, propSchema] of Object.entries(current.properties)) {
      normalizedProps[key] = normalizeInner(propSchema, [...path, key], unsupported);
    }
    current = { ...current, properties: normalizedProps };
  }

  // Recurse into items
  if (current.items) {
    if (Array.isArray(current.items)) {
      current = {
        ...current,
        items: current.items.map((item, i) =>
          normalizeInner(item, [...path, String(i)], unsupported),
        ),
      };
    } else {
      current = {
        ...current,
        items: normalizeInner(current.items, [...path, "[]"], unsupported),
      };
    }
  }

  return current;
}

/**
 * Extracts enum values from a schema node.
 * Supports direct `enum` property and anyOf/oneOf with all-const variants.
 */
export function extractEnumValues(schema: JsonSchema): unknown[] | null {
  if (schema.enum) {
    return schema.enum;
  }

  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) {
    const nonNull = variants.filter(
      (v) => !(v.type === "null" || (typeof v.const === "object" && v.const === null)),
    );
    if (nonNull.length > 0 && nonNull.every((v) => "const" in v)) {
      return nonNull.map((v) => v.const);
    }
  }

  return null;
}
