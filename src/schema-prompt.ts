// Providers without a structured-output helper are taught the response shape in
// the prompt. JSON Schema is the wrong format for that job: it is ~4x larger
// than the information it carries, and on free provider tiers those tokens are
// the difference between a request that runs and a 413.
//
// This renders a JSON Schema as a terse TypeScript-like signature instead. On
// the compat path the schema is guidance, not enforcement — Zod validates the
// result afterwards and a repair loop fixes what it can — so conveying shape
// and allowed values is enough. Constraints such as lengths and numeric bounds
// are deliberately dropped; they are enforced where it counts, at parse time.
//
// Derived, never hand-written: a maintained copy previously drifted and hid
// every treatment added after it, silently restricting non-OpenAI providers.

interface SchemaNode {
  $defs?: Record<string, SchemaNode>;
  $ref?: string;
  allOf?: SchemaNode[];
  anyOf?: SchemaNode[];
  const?: unknown;
  enum?: unknown[];
  items?: SchemaNode;
  oneOf?: SchemaNode[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  type?: string | string[];
}

/** Deep enough for the nested plan schema, shallow enough to stop a cycle. */
const MAX_DEPTH = 32;

export const compactSchemaText = (schema: unknown): string => {
  const root = (schema ?? {}) as SchemaNode;
  const defs = root.$defs ?? {};

  const render = (node: SchemaNode | undefined, depth: number): string => {
    if (!node || depth > MAX_DEPTH) return 'any';

    if (typeof node.$ref === 'string') {
      const target = defs[node.$ref.replace('#/$defs/', '')];
      return target ? render(target, depth + 1) : 'any';
    }
    // z.literal() becomes const, not enum. Missing this collapses every
    // discriminator to `string`, which is how a union of treatments silently
    // turns into an unusable blob.
    if ('const' in node) return JSON.stringify(node.const);
    if (Array.isArray(node.enum)) {
      return node.enum.map((value) => JSON.stringify(value)).join('|');
    }

    const union = node.anyOf ?? node.oneOf;
    if (Array.isArray(union)) {
      const rendered = union.map((option) => render(option, depth + 1));
      // Identical branches carry no extra information for the model.
      return [...new Set(rendered)].join('|') || 'any';
    }
    if (Array.isArray(node.allOf)) {
      return node.allOf.map((option) => render(option, depth + 1)).join('&');
    }

    if (Array.isArray(node.type)) {
      return [...new Set(node.type.map((type) => render({type}, depth + 1)))].join('|');
    }
    if (node.type === 'array') return `${render(node.items, depth + 1)}[]`;
    if (node.type === 'object' || node.properties) {
      const properties = node.properties ?? {};
      const required = new Set(node.required ?? []);
      const body = Object.entries(properties)
        .map(([key, value]) =>
          `${key}${required.has(key) ? '' : '?'}:${render(value, depth + 1)}`)
        .join(',');
      return `{${body}}`;
    }
    if (node.type === 'null') return 'null';
    return typeof node.type === 'string' ? node.type : 'any';
  };

  return render(root, 0);
};

/**
 * Removes visual treatments the current run cannot legally use before the
 * shape is rendered. The prompt already forbids them — a code walkthrough with
 * no supplied code, an image focus with no images and generation disabled, a
 * chart with no numbers in the source — so describing them only spends tokens
 * the free provider tiers do not have. On an 8k TPM tier the difference decides
 * whether any output budget is left at all.
 *
 * Operates on the JSON Schema rather than the text, so a branch cannot be
 * half-removed by a substring match.
 */
export const withoutVisualKinds = (
  schema: unknown,
  excluded: ReadonlySet<string>,
): unknown => {
  if (excluded.size === 0) return schema;

  const prune = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(prune);
    if (!node || typeof node !== 'object') return node;
    const source = node as Record<string, unknown>;
    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if ((key === 'anyOf' || key === 'oneOf') && Array.isArray(value)) {
        const kept = (value as Record<string, unknown>[]).filter((branch) => {
          const properties = branch.properties as Record<string, Record<string, unknown>> | undefined;
          const kind = properties?.kind?.const;
          return typeof kind !== 'string' || !excluded.has(kind);
        });
        // Never prune a union down to nothing; an empty anyOf describes nothing.
        clone[key] = prune(kept.length > 0 ? kept : value);
        continue;
      }
      clone[key] = prune(value);
    }
    return clone;
  };

  return prune(schema);
};
