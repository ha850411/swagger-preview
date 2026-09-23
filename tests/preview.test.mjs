import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const githubFile = 'https://github.com/preview-test/specs/blob/main/';
const spec = (name) => `openapi: 3.0.3
info:
  title: ${name}
  version: 1.0.0
paths:
  /items:
    get:
      responses:
        '200':
          description: Success
`;

test('preview performance and navigation regressions', { timeout: 180_000 }, async (t) => {
    const fixtures = new Map();
    const requests = new Map();
    const server = createServer(async (req, res) => {
        const name = req.url.split('/').pop().replace(/\.yaml$/, '');
        const fixture = fixtures.get(name) || { content: spec(name) };
        requests.set(name, (requests.get(name) || 0) + 1);
        if (fixture.wait) await fixture.wait;
        res.writeHead(fixture.status || 200, { 'Content-Type': 'text/plain' });
        res.end(fixture.content);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const rawUrl = (name) => `http://127.0.0.1:${server.address().port}/raw/${name}.yaml`;
    const profile = await mkdtemp(join(tmpdir(), 'swagger-perf-test-'));
    const context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium', headless: true,
        viewport: { width: 1280, height: 900 },
        args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
    });
    t.after(async () => {
        await context.close();
        await rm(profile, { recursive: true, force: true });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionUrl = worker.url().replace(/background\.js$/, '');
    await worker.evaluate(() => chrome.storage.sync.set({ language: 'en', drawerWidthPercent: 50 }));

    // Observe real Swagger initialization without replacing the renderer or parser.
    await context.addInitScript(() => {
        window.__swaggerRenderCount = 0;
        let bundle;
        Object.defineProperty(window, 'SwaggerUIBundle', {
            configurable: true,
            get: () => bundle,
            set(value) {
                bundle = new Proxy(value, {
                    apply(target, receiver, args) {
                        window.__swaggerRenderCount++;
                        window.__swaggerOptions = args[0];
                        return Reflect.apply(target, receiver, args);
                    }
                });
            }
        });
    });
    await context.route('https://github.com/**', async route => {
        const name = new URL(route.request().url()).pathname.split('/').pop().replace(/\.yaml$/, '');
        await route.fulfill({ contentType: 'text/html', body: `<!doctype html>
            <html><head><title>Preview fixture</title></head><body>
            <div><div class="BtnGroup"><a data-testid="raw-button" href="${rawUrl(name)}"
            style="background:rgb(33,40,48);color:white;border:1px solid gray">Raw</a></div></div>
            <pre>openapi: 3.0.3</pre></body></html>` });
    });

    async function newFile(name, subtest) {
        const page = await context.newPage();
        subtest.after(() => page.close());
        await page.goto(`${githubFile}${name}.yaml`);
        await page.locator('#sp-github-btn').waitFor();
        return page;
    }
    async function open(page) {
        await page.locator('#sp-github-btn').click();
        await page.locator('#sp-drawer.active').waitFor();
    }
    async function loaded(page, title) {
        await page.locator('#sp-loading').waitFor({ state: 'hidden' });
        const frame = page.frames().find(f => f.url().includes('swagger-ui.html'));
        assert.ok(frame, 'preview iframe exists');
        await frame.locator('.info .title').filter({ hasText: title }).waitFor();
        return frame;
    }
    async function switchFile(page, name) {
        await page.locator('#sp-close-btn').click();
        await page.evaluate(({ pageUrl, raw }) => {
            history.pushState({}, '', pageUrl);
            document.querySelector('[data-testid="raw-button"]').href = raw;
            document.dispatchEvent(new Event('turbo:load'));
        }, { pageUrl: `${githubFile}${name}.yaml`, raw: rawUrl(name) });
        await open(page);
    }
    function held(name) {
        let release;
        fixtures.set(name, { content: spec(name), wait: new Promise(resolve => { release = resolve; }) });
        return release;
    }

    await t.test('button is available before deferred page scripts finish', async st => {
        const page = await context.newPage();
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        st.after(async () => { release(); await page.close(); });
        await page.route('https://github.com/slow-page.js', async route => {
            await gate;
            await route.fulfill({ contentType: 'application/javascript', body: 'window.deferredPageScriptFinished = true;' });
        });
        await page.route(`${githubFile}early.yaml`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
            <html><head><script defer src="/slow-page.js"></script></head><body>
            <a data-testid="raw-button" href="${rawUrl('early')}">Raw</a></body></html>` }));
        await page.goto(`${githubFile}early.yaml`, { waitUntil: 'commit' });
        await page.locator('#sp-github-btn').waitFor({ timeout: 5000 });
        assert.equal(await page.evaluate(() => window.deferredPageScriptFinished === true), false);
        release();
        await page.waitForLoadState();
    });

    await t.test('late toolbar replaces fallback during continuous DOM updates', async st => {
        const page = await context.newPage();
        st.after(() => page.close());
        await page.route(`${githubFile}late-toolbar.yaml`, route => route.fulfill({
            contentType: 'text/html', body: '<!doctype html><html><body><main></main></body></html>'
        }));
        await page.goto(`${githubFile}late-toolbar.yaml`);
        await page.locator('#sp-floating-btn').waitFor();
        const result = await page.evaluate(async raw => {
            const toolbar = document.createElement('div');
            toolbar.innerHTML = `<div class="BtnGroup"><a data-testid="raw-button" href="${raw}">Raw</a></div>`;
            const start = performance.now();
            document.body.appendChild(toolbar);
            // Never allow 120 ms of quiet time; the button must still mount.
            for (let i = 0; i < 4; i++) {
                document.querySelector('main').appendChild(document.createElement('span'));
                document.dispatchEvent(new Event('turbo:render'));
                await new Promise(requestAnimationFrame);
            }
            return { mounted: !!document.getElementById('sp-github-btn'),
                fallback: !!document.getElementById('sp-floating-btn'), elapsedMs: performance.now() - start };
        }, rawUrl('late-toolbar'));
        assert.equal(result.mounted, true);
        assert.equal(result.fallback, false);
        st.diagnostic(`Toolbar promoted within four animation frames (${result.elapsedMs.toFixed(1)} ms in this run).`);
    });

    await t.test('toolbar replacement moves the existing button; unsupported navigation removes it', async st => {
        const page = await newFile('replace-toolbar', st);
        await page.evaluate(raw => {
            document.querySelector('.BtnGroup').remove();
            const group = document.createElement('div');
            group.className = 'BtnGroup';
            group.innerHTML = `<a data-testid="raw-button" href="${raw}">Raw</a>`;
            document.body.appendChild(group);
        }, rawUrl('replace-toolbar'));
        await page.waitForFunction(() => document.getElementById('sp-github-btn')?.nextElementSibling === document.querySelector('.BtnGroup'));
        assert.equal(await page.locator('#sp-github-btn').count(), 1);
        await page.evaluate(() => {
            history.pushState({}, '', '/preview-test/specs/blob/main/README.md');
            document.body.appendChild(document.createElement('span'));
        });
        await page.locator('#sp-github-btn').waitFor({ state: 'detached' });
        assert.equal(await page.locator('#sp-floating-btn').count(), 0);
    });

    await t.test('unrelated DOM updates cause no full-page queries or button mutations', async st => {
        const page = await newFile('observer-cost', st);
        async function countWork() {
            await worker.evaluate(async url => {
                const [tab] = await chrome.tabs.query({ url });
                await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
                    if (!window.__originalDocumentQuery) {
                        window.__originalDocumentQuery = document.querySelector;
                        document.querySelector = function(...args) {
                            window.__documentQueryCount++;
                            return window.__originalDocumentQuery.apply(this, args);
                        };
                    }
                    window.__documentQueryCount = 0;
                } });
            }, page.url());
            const mutations = await page.evaluate(async () => {
                let count = 0;
                const button = document.getElementById('sp-github-btn') || document.getElementById('sp-floating-btn');
                const observer = new MutationObserver(records => { count += records.length; });
                observer.observe(button, { childList: true, subtree: true, attributes: true });
                for (let i = 0; i < 5; i++) {
                    const unrelated = document.createElement('div');
                    unrelated.innerHTML = '<span>Unrelated update</span>';
                    document.body.appendChild(unrelated);
                    await new Promise(requestAnimationFrame);
                    unrelated.remove();
                }
                await new Promise(requestAnimationFrame);
                observer.disconnect();
                return count;
            });
            const queries = await worker.evaluate(async url => {
                const [tab] = await chrome.tabs.query({ url });
                const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id },
                    func: () => window.__documentQueryCount });
                return result.result;
            }, page.url());
            assert.equal(queries, 0);
            assert.equal(mutations, 0);
        }
        await countWork();
        await page.evaluate(() => document.querySelector('.BtnGroup').remove());
        await page.locator('#sp-floating-btn').waitFor();
        await countWork();
    });

    await t.test('one initialization on first load and none on reopen; expanded state survives', async st => {
        const page = await newFile('reopen', st);
        await open(page);
        const frame = await loaded(page, 'reopen');
        assert.equal(await frame.evaluate(() => window.__swaggerRenderCount), 1);
        assert.equal(await frame.evaluate(() => window.__swaggerOptions.docExpansion), 'list');
        await frame.locator('.opblock-summary').click();
        await frame.locator('.opblock.is-open').waitFor();
        for (let i = 0; i < 3; i++) {
            await page.locator('#sp-close-btn').click();
            await open(page);
        }
        await loaded(page, 'reopen');
        assert.equal(requests.get('reopen'), 1);
        assert.equal(await frame.evaluate(() => window.__swaggerRenderCount), 1);
        assert.equal(await frame.locator('.opblock.is-open').count(), 1);
        assert.equal(await frame.evaluate(() => performance.getEntriesByType('resource')
            .some(r => r.name.includes('standalone-preset'))), false);
    });

    await t.test('reopening during download shares the request and waits for rendering', async st => {
        const release = held('pending');
        st.after(release);
        const page = await newFile('pending', st);
        await open(page);
        await page.locator('#sp-close-btn').click();
        await open(page);
        assert.equal(await page.locator('#sp-loading').isVisible(), true);
        release();
        const frame = await loaded(page, 'pending');
        assert.equal(requests.get('pending'), 1);
        assert.equal(await frame.evaluate(() => window.__swaggerRenderCount), 1);
    });

    await t.test('late download cannot overwrite a newer document', async st => {
        const release = held('old');
        st.after(release);
        const page = await newFile('old', st);
        await open(page);
        await switchFile(page, 'new');
        const frame = await loaded(page, 'new');
        release();
        // Let the actual fetch response and extension message pass through both contexts.
        await page.waitForTimeout(300);
        assert.match(await frame.locator('.info .title').textContent(), /new/);
        assert.equal(await frame.evaluate(() => window.__swaggerRenderCount), 1);
    });

    await t.test('failed parse can retry with fresh content', async st => {
        fixtures.set('retry', { content: 'openapi: 3.0.3\ninfo: [broken' });
        const page = await newFile('retry', st);
        await open(page);
        await page.locator('#sp-error').waitFor();
        fixtures.set('retry', { content: spec('recovered') });
        await page.locator('#sp-retry-btn').click();
        await loaded(page, 'recovered');
        assert.equal(requests.get('retry'), 2);
    });

    await t.test('LRU keeps recently read entries and evicts the oldest of five', async st => {
        const page = await newFile('lru-a', st);
        await open(page);
        await loaded(page, 'lru-a');
        for (const name of ['lru-b', 'lru-c', 'lru-d', 'lru-e', 'lru-a', 'lru-f', 'lru-a', 'lru-b']) {
            await switchFile(page, name);
            await loaded(page, name);
        }
        assert.equal(requests.get('lru-a'), 1);
        assert.equal(requests.get('lru-b'), 2);
    });

    await t.test('cache obeys byte budget and large specs start collapsed', async st => {
        for (const name of ['bytes-a', 'bytes-b', 'bytes-c']) {
            fixtures.set(name, { content: `#${'x'.repeat(3 * 1024 * 1024)}\n${spec(name)}` });
        }
        const page = await newFile('bytes-a', st);
        await open(page);
        const frame = await loaded(page, 'bytes-a');
        assert.equal(await frame.evaluate(() => window.__swaggerOptions.docExpansion), 'none');
        assert.equal(await frame.evaluate(() => window.__swaggerOptions.defaultModelsExpandDepth), 0);
        assert.equal(await frame.evaluate(() => window.__swaggerOptions.syntaxHighlight.activated), false);
        await frame.locator('.opblock-tag').click();
        await frame.locator('.opblock-summary').waitFor();
        for (const name of ['bytes-b', 'bytes-c', 'bytes-a']) {
            await switchFile(page, name);
            await loaded(page, name);
        }
        assert.equal(requests.get('bytes-a'), 2);
    });

    await t.test('drag flushes last movement on mouseup and persists/syncs width', async st => {
        const page = await newFile('resize', st);
        await open(page);
        await loaded(page, 'resize');
        await page.evaluate(() => {
            const shadow = document.querySelector('#swagger-preview-drawer-host').shadowRoot;
            shadow.querySelector('#sp-resizer').dispatchEvent(new MouseEvent('mousedown'));
            for (const clientX of [200, 400, 600]) window.dispatchEvent(new MouseEvent('mousemove', { clientX }));
            window.dispatchEvent(new MouseEvent('mouseup'));
        });
        await page.waitForFunction(() => document.querySelector('#swagger-preview-drawer-host')
            .shadowRoot.querySelector('#sp-drawer').style.width === '53vw');
        assert.equal((await worker.evaluate(() => chrome.storage.sync.get('drawerWidthPercent'))).drawerWidthPercent, 53);
        const secondPage = await newFile('resize-second', st);
        await open(secondPage);
        await loaded(secondPage, 'resize-second');
        assert.equal(await secondPage.locator('#sp-drawer').evaluate(el => el.style.width), '53vw');
        await worker.evaluate(() => chrome.storage.sync.set({ drawerWidthPercent: 75 }));
        for (const target of [page, secondPage]) {
            await target.waitForFunction(() => document.querySelector('#swagger-preview-drawer-host')
                .shadowRoot.querySelector('#sp-drawer').style.width === '75vw');
        }
    });

    await t.test('background deduplicates concurrent downloads and releases failed requests', async () => {
        const result = await worker.evaluate(async url => {
            const first = fetchSwaggerContent(url);
            const second = fetchSwaggerContent(url);
            return { samePromise: first === second, contents: await Promise.all([first, second]) };
        }, rawUrl('shared'));
        assert.equal(result.samePromise, true);
        assert.equal(result.contents[0], result.contents[1]);
        assert.equal(requests.get('shared'), 1);
        fixtures.set('failed', { status: 500, content: 'server error' });
        assert.equal(await worker.evaluate(url => fetchSwaggerContent(url).then(() => false, () => true), rawUrl('failed')), true);
        fixtures.set('failed', { content: spec('fixed') });
        assert.match(await worker.evaluate(url => fetchSwaggerContent(url), rawUrl('failed')), /fixed/);
        assert.equal(requests.get('failed'), 2);
    });

    await t.test('standalone storage preview still renders and shows source navigation', async st => {
        await worker.evaluate(content => chrome.storage.local.set({ test_standalone: { content, url: 'https://github.com/test/repo/blob/main/spec.yaml' } }), spec('standalone'));
        const page = await context.newPage();
        st.after(() => page.close());
        await page.goto(`${extensionUrl}swagger-ui.html?key=test_standalone`);
        await page.locator('.info .title').filter({ hasText: 'standalone' }).waitFor();
        assert.equal(await page.locator('#top-nav').isVisible(), true);
    });
});
