import type { JsonSchema, ConfigUiHints, ConfigUiHint } from "../types/agents";

/** Converts camelCase/snake_case to "Title Case" */
export function humanize(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/^./, (m) => m.toUpperCase());
}

/** Joins a path array into a dot-separated key */
export function pathKey(path: Array<string | number>): string {
  return path.join(".");
}

/** Look up a UI hint by dot path, supporting wildcard segments ("*") */
export function hintForPath(
  path: Array<string | number>,
  hints: ConfigUiHints,
): ConfigUiHint | undefined {
  const key = pathKey(path);

  // Exact match
  if (hints[key]) {
    return hints[key];
  }

  // Wildcard match
  const pathSegments = key.split(".");
  for (const [hintKey, hint] of Object.entries(hints)) {
    const hintSegments = hintKey.split(".");
    if (hintSegments.length !== pathSegments.length) continue;

    const matches = hintSegments.every((seg, i) => seg === "*" || seg === pathSegments[i]);
    if (matches) return hint;
  }

  return undefined;
}

const SENSITIVE_TOKENS = ["token", "password", "secret", "apikey"];

/** Returns true if the path likely refers to a sensitive value */
export function isSensitivePath(path: Array<string | number>): boolean {
  const key = pathKey(path).toLowerCase();
  if (SENSITIVE_TOKENS.some((tok) => key.includes(tok))) return true;
  return key.endsWith("key");
}

/** Returns a human-readable label for a config field */
export function getFieldLabel(
  path: Array<string | number>,
  schema: JsonSchema,
  hints: ConfigUiHints,
): string {
  const hint = hintForPath(path, hints);
  if (hint?.label) return hint.label;
  if (schema.title) return schema.title;
  const last = path[path.length - 1];
  return humanize(String(last ?? ""));
}

/** Returns a sensible default value for a schema type */
export function defaultValue(schema: JsonSchema): unknown {
  if ("default" in schema) return schema.default;

  const t = Array.isArray(schema.type)
    ? (schema.type.find((v) => v !== "null") ?? "string")
    : schema.type;

  switch (t) {
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "object":
      return {};
    case "array":
      return [];
    default:
      return "";
  }
}

/** Immutable deep set: returns a new object with value set at the given path */
export function setPathValue(
  obj: Record<string, unknown>,
  path: Array<string | number>,
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return obj;

  const [head, ...rest] = path;
  const key = String(head);
  const clone = { ...obj };

  if (rest.length === 0) {
    clone[key] = value;
  } else {
    const child =
      typeof clone[key] === "object" && clone[key] !== null
        ? (clone[key] as Record<string, unknown>)
        : {};
    clone[key] = setPathValue({ ...child }, rest, value);
  }

  return clone;
}

/** Immutable deep delete: returns a new object with the key at path removed */
export function removePathValue(
  obj: Record<string, unknown>,
  path: Array<string | number>,
): Record<string, unknown> {
  if (path.length === 0) return obj;

  const [head, ...rest] = path;
  const key = String(head);
  const clone = { ...obj };

  if (rest.length === 0) {
    delete clone[key];
  } else {
    const child = clone[key];
    if (typeof child === "object" && child !== null) {
      clone[key] = removePathValue({ ...(child as Record<string, unknown>) }, rest);
    }
  }

  return clone;
}
