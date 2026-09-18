import {describe, expect, it} from 'vitest';
import {z} from 'zod';
import {compactSchemaText, withoutVisualKinds} from './schema-prompt.js';

const render = (schema: z.ZodType): string =>
  compactSchemaText(z.toJSONSchema(schema, {io: 'output', unrepresentable: 'any'}));

describe('compactSchemaText', () => {
  it('marks optional properties and leaves required ones bare', () => {
    expect(render(z.object({a: z.string(), b: z.number().optional()})))
      .toBe('{a:string,b?:number}');
  });

  it('renders enums as a choice of literals', () => {
    expect(render(z.object({t: z.enum(['one', 'two'])}))).toBe('{t:"one"|"two"}');
  });

  it('preserves a literal instead of widening it to its base type', () => {
    // z.literal() emits `const`, which is how discriminated unions stay usable.
    expect(render(z.object({kind: z.literal('character-scene')})))
      .toBe('{kind:"character-scene"}');
  });

  it('keeps every branch of a discriminated union distinguishable', () => {
    const shape = render(z.discriminatedUnion('kind', [
      z.object({kind: z.literal('a'), x: z.string()}),
      z.object({kind: z.literal('b'), y: z.number()}),
    ]));
    expect(shape).toContain('"a"');
    expect(shape).toContain('"b"');
    expect(shape).not.toContain('kind:string');
  });

  it('collapses union branches that carry identical information', () => {
    expect(render(z.union([z.string(), z.string()]))).toBe('string');
  });

  it('renders arrays and nested objects', () => {
    expect(render(z.object({items: z.array(z.object({id: z.string()}))})))
      .toBe('{items:{id:string}[]}');
  });

  it('renders a nullable field as a union with null', () => {
    const shape = render(z.object({a: z.string().nullable()}));
    expect(shape).toContain('null');
    expect(shape).toContain('string');
  });

  it('drops constraints, which are enforced at parse time instead', () => {
    // `integer` survives because it narrows the value; lengths and bounds do
    // not, since Zod rejects those at parse time anyway.
    const shape = render(z.object({a: z.string().min(3).max(9), b: z.number().int().min(0)}));
    expect(shape).toBe('{a:string,b:integer}');
  });

  it('resolves internal references rather than emitting a ref', () => {
    const inner = z.object({id: z.string()});
    const shape = render(z.object({first: inner, second: inner}));
    expect(shape).not.toContain('$ref');
    expect(shape).toBe('{first:{id:string},second:{id:string}}');
  });

  it('terminates on a recursive schema instead of hanging', () => {
    const node: z.ZodType = z.lazy(() => z.object({child: node.optional()}));
    const shape = compactSchemaText(
      z.toJSONSchema(node, {io: 'output', unrepresentable: 'any'}),
    );
    expect(shape.length).toBeGreaterThan(0);
  });

  it('degrades to any rather than throwing on an unknown node', () => {
    expect(compactSchemaText({})).toBe('any');
    expect(compactSchemaText(null)).toBe('any');
    expect(compactSchemaText({$ref: '#/$defs/missing'})).toBe('any');
  });

  it('is markedly smaller than the JSON Schema it renders', () => {
    const schema = z.object({
      scenes: z.array(z.object({
        id: z.string(), title: z.string(),
        kind: z.enum(['one', 'two', 'three']),
        items: z.array(z.string()),
      })),
    });
    const json = JSON.stringify(z.toJSONSchema(schema, {io: 'output', unrepresentable: 'any'}));
    expect(compactSchemaText(JSON.parse(json)).length).toBeLessThan(json.length / 2);
  });
});

describe('withoutVisualKinds', () => {
  const schema = {
    type: 'object',
    properties: {
      visual: {
        anyOf: [
          {type: 'object', properties: {kind: {const: 'diagram'}}},
          {type: 'object', properties: {kind: {const: 'data-visualization'}, chart: {type: 'object'}}},
          {type: 'object', properties: {kind: {const: 'character-scene'}, cast: {type: 'array'}}},
        ],
      },
    },
  };

  it('removes only the named branches', () => {
    const pruned = compactSchemaText(withoutVisualKinds(schema, new Set(['data-visualization'])));
    expect(pruned).toContain('"diagram"');
    expect(pruned).toContain('"character-scene"');
    expect(pruned).not.toContain('"data-visualization"');
  });

  it('returns the schema untouched when nothing is excluded', () => {
    expect(compactSchemaText(withoutVisualKinds(schema, new Set())))
      .toBe(compactSchemaText(schema));
  });

  it('never empties a union, which would describe nothing at all', () => {
    const all = new Set(['diagram', 'data-visualization', 'character-scene']);
    const pruned = compactSchemaText(withoutVisualKinds(schema, all));
    expect(pruned).toContain('"diagram"');
  });

  it('leaves branches without a literal kind alone', () => {
    const loose = {anyOf: [{type: 'string'}, {type: 'object', properties: {kind: {const: 'gone'}}}]};
    const pruned = compactSchemaText(withoutVisualKinds(loose, new Set(['gone'])));
    expect(pruned).toBe('string');
  });
});
