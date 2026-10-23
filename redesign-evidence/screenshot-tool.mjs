import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const base = process.argv[2];
const outDir = process.argv[3];
if (!base || !outDir) { console.error('usage: node screenshot-tool.mjs <base> <outDir>'); process.exit(1); }
await fs.mkdir(outDir, { recursive: true });
const widths = [360, 390, 768, 1280];
const pages = [ ['home','/'], ['login','/login'], ['dashboard','/dashboard'] ];
const browser = await chromium.launch();
for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const [name, path] of pages) {
    await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(async () => { await page.goto(base + path, { waitUntil: 'load', timeout: 60000 }); });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${outDir}/${name}-${width}.png`, fullPage: true });
    console.log('shot', name, width);
  }
  await context.close();
}
await browser.close();
