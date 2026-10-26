// Runs in a separate process. Third-party editor code never enters the Remotion bundle.
import {readFile, writeFile, mkdir, copyFile, readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {resolve, dirname, extname, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const job = JSON.parse(await readFile(process.argv[2], 'utf8'));
const tools = resolve(job.toolsRoot), source = resolve(job.sourceDirectory);
const load = file => import(pathToFileURL(resolve(tools, file)).href);
const name = index => `frame-${String(index).padStart(6, '0')}.png`;
await mkdir(source, {recursive: true});

async function mcpSession(work) {
  const child = spawn(process.execPath, [resolve(tools, 'stykanimate-mcp/src/index.js')], {stdio: ['pipe', 'pipe', 'inherit']});
  const waiting = new Map(); let buffer = '', id = 0;
  child.stdout.on('data', data => {
    buffer += data; let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      try {const message = JSON.parse(line); waiting.get(message.id)?.(message); waiting.delete(message.id);} catch { /* stderr is reserved upstream */ }
    }
  });
  child.once('exit', () => {for (const done of waiting.values()) done({error: {message: 'StykAnimate MCP exited.'}});});
  const request = (method, params) => new Promise((accept, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => {waiting.delete(requestId); reject(new Error('StykAnimate MCP timed out.'));}, 30000);
    waiting.set(requestId, message => {clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : accept(message.result);});
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: requestId, method, params}) + '\n');
  });
  const call = async (name, args = {}) => {
    const result = await request('tools/call', {name, arguments: args});
    if (result.isError) throw new Error(JSON.stringify(result.content));
    return result.structuredContent;
  };
  try {
    await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'youtube-animations', version: '1'}});
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n');
    return await work(call);
  } finally {child.stdin.end(); child.kill();}
}

if (job.action === 'author-styk') {
  const {emptyDocument, createObject, createFrame} = await load('stykanimate/src/demo.mjs');
  const {buildContainerV2} = await load('stykanimate-mcp/src/core.js');
  const doc = emptyDocument();
  doc.canvas_width = job.width; doc.canvas_height = job.height; doc.fps = job.fps;
  doc.backgrounds = [{background_id: 1, kind: 2, color: 0}];
  const cast = job.cast;
  const scale = Math.min(job.width / 1050, job.height / 650) * .9;
  doc.keyframes = job.cues.map((cue, index) => createFrame(cast.map((character, i) => createObject(doc.figure_types[0], i + 1,
    job.width * (i + 1) / (cast.length + 1), job.height * .6, {scale})), Math.max(1, Math.round(((job.cues[index + 1]?.startMs ?? job.durationMs) - (index ? cue.startMs : 0)) * job.fps / 1000))));
  // Pivot's terminal pose is a single tick; retain the final beat with a terminal hold.
  doc.keyframes.push(createFrame(structuredClone(doc.keyframes.at(-1).objects), 1));
  for (const frame of doc.keyframes) frame.background_id = 1;
  const seed = resolve(source, 'seed.styk'), output = resolve(source, 'native.styk');
  await writeFile(seed, await buildContainerV2(doc, 'styk'));
  await mcpSession(async call => {
    await call('project_open', {path: seed});
    for (let frame = 0; frame < job.cues.length; frame++) {
      for (let i = 0; i < cast.length; i++) {
        const active = job.speakers?.[frame] === cast[i].id || (!job.speakers?.[frame] && i === frame % cast.length);
        const gesture = job.recipe.gestures[frame] ?? 'point';
        await call('pose_set', {uid: i + 1, frame, joints: [{index: 2, angleDeg: active ? gesture === 'wave' ? -80 : gesture === 'idle' ? 65 : -35 : 65}, {index: 3, angleDeg: active ? gesture === 'agree' ? -20 : -65 : 85}]});
        await call('style_set', {target: 'figure', uid: i + 1, frame, color: i % 2 ? '#22D3EE' : '#A78BFA'});
      }
    }
    await call('project_validate');
    await call('project_save', {path: output, format: 'styk'});
    await call('project_close');
    await call('project_open', {path: output});
    await call('project_validate');
  });
  console.log(JSON.stringify({file: output}));
  process.exit(0);
}

const runtimeRequire = createRequire(resolve(tools, 'runtime/package.json'));
const {default: puppeteer} = await import(pathToFileURL(runtimeRequire.resolve('puppeteer-core')).href);
if (job.action === 'verify-player') {
  const sceneDirectory = resolve(tools, 'lottie/public/projects/animation-verification/scene-1');
  await mkdir(sceneDirectory, {recursive: true});
  await copyFile(resolve(source, 'native.json'), resolve(sceneDirectory, 'lottie.json'));
  await copyFile(resolve(source, 'Inter.ttf'), resolve(sceneDirectory, 'Inter.ttf'));
  const lottieRequire = createRequire(resolve(tools, 'lottie/package.json'));
  const {createServer: createViteServer} = await import(pathToFileURL(lottieRequire.resolve('vite')).href);
  const vite = await createViteServer({root: resolve(tools, 'lottie'), configFile: resolve(tools, 'lottie/vite.config.ts'), server: {host: '127.0.0.1', port: 0}});
  let browser;
  try {
    await vite.listen();
    const address = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await puppeteer.launch({executablePath: job.browser, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
    const page = await browser.newPage(); await page.setViewport({width: 1440, height: 1000});
    await page.goto(`${address}/animation-verification/scene-1?frame=${job.frame}`, {waitUntil: 'networkidle0'});
    await page.waitForFunction(async () => {const context = await (await fetch('/__context')).json(); return context.live?.totalFrames > 0;}, {timeout: 30000});
    await page.screenshot({path: job.output});
  } finally {await browser?.close(); await vite.close();}
  process.exit(0);
}
const mime = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.png': 'image/png'};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/runner.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><canvas id="canvas"></canvas><script src="/tools/lottie/node_modules/canvaskit-wasm/bin/full/canvaskit.js"></script>'); return;
    }
    const isProject = url.pathname.startsWith('/project/');
    const base = isProject ? source : tools;
    const file = resolve(base, decodeURIComponent(url.pathname.slice(isProject ? 9 : 7)));
    if (!file.startsWith(base + sep)) throw new Error('Invalid path.');
    res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.statusCode = 404; res.end();}
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await puppeteer.launch({executablePath: job.browser, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  const page = await browser.newPage();
  await page.setViewport({width: job.width, height: job.height, deviceScaleFactor: 1});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(origin + '/') || req.url().startsWith('data:') || req.url().startsWith('blob:') ? req.continue() : req.abort());
  await page.goto(origin + '/runner.html');
  if (job.action === 'author-lottie') {
    const paths = await page.evaluate(async () => {
      const svg = new DOMParser().parseFromString(await (await fetch('/project/icon.svg')).text(), 'image/svg+xml').documentElement;
      document.body.append(svg);
      const paths = [...svg.querySelectorAll('path,circle,line,rect,ellipse,polyline,polygon')].map(element => {
        const length = element.getTotalLength(), matrix = element.getCTM();
        const count = Math.max(32, Math.min(1024, Math.ceil(length / .12)));
        const vertices = Array.from({length: count + 1}, (_, index) => {
          const point = element.getPointAtLength(length * index / count).matrixTransform(matrix);
          return [(point.x - 12) * 3, (point.y - 12) * 3];
        });
        return {ty: 'sh', nm: 'Source SVG outline', ks: {a: 0, k: {v: vertices, i: vertices.map(() => [0, 0]), o: vertices.map(() => [0, 0]), c: false}}};
      });
      svg.remove(); return paths;
    });
    const native = JSON.parse(await readFile(resolve(source, 'native.json'), 'utf8'));
    for (const layer of native.layers.filter(layer => layer.ty === 4)) layer.shapes = [...paths, ...layer.shapes.filter(shape => shape.ty !== 'el')];
    await writeFile(resolve(source, 'native.json'), JSON.stringify(native, null, 2) + '\n');
    console.log(JSON.stringify({svgPaths: paths.length}));
    process.exitCode = 0;
  } else {
  if (job.tool === 'lottie') {
    await page.evaluate(async ({width, height}) => {
      const ck = await CanvasKitInit({locateFile: () => '/tools/lottie/public/canvaskit.wasm'});
      const json = await (await fetch('/project/native.json')).text();
      const font = new Uint8Array(await (await fetch('/project/Inter.ttf')).arrayBuffer());
      const canvas = document.querySelector('canvas'); canvas.width = width; canvas.height = height;
      const surface = ck.MakeSWCanvasSurface(canvas);
      const animation = ck.MakeManagedAnimation(json, {'Inter.ttf': font});
      if (!surface || !animation) throw new Error('Skottie could not load the animation.');
      window.draw = frame => {const context = surface.getCanvas(); context.clear(ck.TRANSPARENT); animation.seekFrame(frame); animation.render(context, ck.LTRBRect(0, 0, width, height)); surface.flush();};
    }, job);
  } else if (job.tool === 'stykanimate') {
    await page.evaluate(async ({width, height}) => {
      const [{decodeDocument, normalizeDecodedDocument}, {ExportFrameRenderer}] = await Promise.all([
        import('/tools/stykanimate/src/native-container.mjs'), import('/tools/stykanimate/src/export-frame-renderer.mjs'),
      ]);
      const data = new Uint8Array(await (await fetch('/project/native.styk')).arrayBuffer());
      const decoded = await decodeDocument(data, 'styk');
      const renderer = new ExportFrameRenderer({width, height});
      await renderer.load(normalizeDecodedDocument(decoded.document, 'styk'));
      window.draw = async frame => {
        const output = await renderer.renderNativeTick(Math.floor(frame), {preserveAlpha: true});
        return Array.from(new Uint8Array(await output.blob.arrayBuffer()));
      };
    }, job);
  } else throw new Error(`Unsupported worker tool ${job.tool}`);
  await mkdir(job.outputDirectory, {recursive: true});
  for (const [index, frame] of job.sourceFrames.entries()) {
    const bytes = await page.evaluate(async frame => {
      const output = await window.draw(frame);
      if (output) return output;
      const canvas = document.querySelector('canvas');
      return Array.from(new Uint8Array(await (await new Promise(done => canvas.toBlob(done, 'image/png'))).arrayBuffer()));
    }, frame);
    await writeFile(resolve(job.outputDirectory, name(index)), Buffer.from(bytes));
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({frames: job.sourceFrames.length}));
  }
} finally {await browser?.close(); await new Promise(done => server.close(done));}
