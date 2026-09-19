import { Window } from 'happy-dom';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

export function boot(root, options = {}) {
    const window = new Window({ url: 'https://wordquest.test/', settings: {
        disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true,
        disableCSSFileLoading: true, disableComputedStyleRendering: true
    }});
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    // Browsers coerce numeric innerText values; Happy DOM's setter does not.
    const innerText = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'innerText');
    Object.defineProperty(window.HTMLElement.prototype, 'innerText', { ...innerText,
        set(value) { innerText.set.call(this, String(value)); }
    });
    window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
    const canvas = new Proxy({}, { get(target, key) { return target[key] ?? (() => {}); }, set(target, key, value) { target[key] = value; return true; } });
    window.HTMLCanvasElement.prototype.getContext = () => canvas;
    window.AudioContext = undefined;
    const values = new Map(Object.entries(options.stored || {}));
    const storage = {
        getItem(key) { if (options.blockStorage) throw Error('Storage blocked'); return values.get(key) ?? null; },
        setItem(key, value) { if (options.blockStorage) throw Error('Storage blocked'); values.set(key, String(value)); },
        removeItem(key) { if (options.blockStorage) throw Error('Storage blocked'); values.delete(key); }
    };
    let now = 0, timerId = 0;
    const timers = new Map(), errors = [];
    const sandbox = { window, document: window.document, localStorage: storage,
        console: { log() {}, warn() {}, error(...args) { errors.push(args.join(' ')); } },
        performance: { now: () => now },
        setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
        clearTimeout(id) { timers.delete(id); }, requestAnimationFrame() {},
        fetch: () => Promise.reject(Error('Network forbidden during tests')) };
    const context = vm.createContext(sandbox);
    const run = (source) => vm.runInContext(source, context, { timeout: 10000 });
    // Repeatable random boards; test outcomes must not depend on a lucky roll.
    run('let testSeed = 782345; Math.random = () => { testSeed = (Math.imul(1664525, testSeed) + 1013904223) >>> 0; return testSeed / 4294967296; };');
    if (options.baseline) {
        const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/App\.init\(\);\s*$/, '');
        run(source);
        run("AudioSys.init = () => {}; App.renderer = new Renderer(); App.initParticles(); Dict.isReady = true; Dict.words = new Set(['CAT', 'AT', 'VOID']);");
    } else {
        if (!options.noDictionary) run(fs.readFileSync(path.join(root, 'dictionary.js'), 'utf8'));
        run(fs.readFileSync(path.join(root, 'engine.js'), 'utf8'));
        run(fs.readFileSync(path.join(root, 'game.js'), 'utf8'));
    }
    return { run, window, document: window.document, errors, values, timers, canvas,
        setNow(value) { now = value; },
        async close() { await window.happyDOM.abort(); window.close(); } };
}