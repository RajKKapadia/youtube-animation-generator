import {afterEach, describe, expect, it} from 'vitest';
import {mkdtemp, mkdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {codeSelectionIssue, discoverLocalCode, materializeCodeVisual, validateSavedCode} from './local-code.js';
import {EXPLAINER_FIXTURES} from './explainer-fixtures.js';

const folders: string[] = [];
const folder = async () => {const value = await mkdtemp(join(tmpdir(), 'explainer-code-test-')); folders.push(value); return value;};
afterEach(async () => {await Promise.all(folders.splice(0).map((path) => rm(path, {recursive: true, force: true})));});

describe('supplied code excerpts', () => {
  it('extracts fenced code and sorted files while preserving indentation and excluding symlinks', async () => {
    const root = await folder(); await mkdir(join(root, 'code'));
    await writeFile(join(root, 'code/z.py'), 'def greet(name):\r\n    return name\r\n');
    await writeFile(join(root, 'code/a.js'), 'const answer = 42;');
    await symlink(join(root, 'code/a.js'), join(root, 'code/link.js'));
    await writeFile(join(root, 'code/invalid.py'), Buffer.from([0xff, 0xff]));
    const result = await discoverLocalCode({sourcePath: join(root, 'source.md'), sourceText: 'Explanation.\n```python\ndef run():\n    return True\n```'});
    expect(result.sources.map(({originalName}) => originalName)).toEqual(['source.md#L3', 'a.js', 'z.py']);
    expect(result.sources[0]!.text).toBe('def run():\n    return True');
    expect(result.sources[2]!.text).toContain('\n    return name');
    expect(result.warnings.join(' ')).toContain('invalid UTF-8');
  });

  it('enforces file and aggregate limits with visible warnings', async () => {
    const root = await folder(); await mkdir(join(root, 'code'));
    await writeFile(join(root, 'code/oversized.py'), 'x'.repeat(32769));
    for (let index = 0; index < 6; index++) await writeFile(join(root, `code/file-${index}.txt`), 'x'.repeat(32768));
    const result = await discoverLocalCode({sourcePath: join(root, 'source.srt')});
    expect(result.sources).toHaveLength(4);
    expect(result.warnings).toHaveLength(3);
  });

  it('embeds exact code for offline rerendering and detects a modified excerpt', async () => {
    const root = await folder(); await mkdir(join(root, 'code'));
    await writeFile(join(root, 'code/example.py'), 'def greet(name):\n    message = name\n    return message');
    const catalog = await discoverLocalCode({sourcePath: join(root, 'video.srt')});
    const selection = structuredClone(EXPLAINER_FIXTURES[2]!.scene.visual);
    if (selection.kind !== 'code-walkthrough') throw new Error('fixture');
    selection.sourceId = catalog.sources[0]!.id;
    const visual = materializeCodeVisual(selection, catalog.sources);
    await rm(join(root, 'code'), {recursive: true});
    expect(() => validateSavedCode([{visual}])).not.toThrow();
    expect(visual.excerpt.text).toContain('\n    message = name');
    visual.excerpt.text = visual.excerpt.text.replace('name', 'other');
    expect(() => validateSavedCode([{visual}])).toThrow('checksum mismatch');
  });

  it('rejects excerpts outside the original source and overlong display lines', async () => {
    const root = await folder(); await mkdir(join(root, 'code'));
    await writeFile(join(root, 'code/example.txt'), 'x'.repeat(61));
    const catalog = await discoverLocalCode({sourcePath: join(root, 'video.srt')});
    const visual = structuredClone(EXPLAINER_FIXTURES[2]!.scene.visual);
    if (visual.kind !== 'code-walkthrough') throw new Error('fixture');
    visual.sourceId = catalog.sources[0]!.id;
    expect(codeSelectionIssue(visual, catalog.sources)).toContain('outside its source');
    visual.endLine = 1;
    expect(codeSelectionIssue(visual, catalog.sources)).toContain('60 columns');
  });
});
