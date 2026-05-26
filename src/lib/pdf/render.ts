/**
 * HTML → PDF rendering.
 *
 * Two paths:
 *   - Local / long-running server: regular `puppeteer` (downloads Chromium on install)
 *   - Serverless (Vercel/AWS Lambda): puppeteer-core + @sparticuz/chromium
 *
 * Driven by env: PDF_RUNTIME=local (default) | serverless
 */

let _browser: import('puppeteer-core').Browser | null = null;

async function getBrowser(): Promise<import('puppeteer-core').Browser> {
  if (_browser) return _browser;

  if (process.env.PDF_RUNTIME === 'serverless') {
    const puppeteer = await import('puppeteer-core');
    const chromium = (await import('@sparticuz/chromium')).default;
    _browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    // Use full puppeteer (downloads Chromium). API-compatible with puppeteer-core.
    const puppeteer = await import('puppeteer');
    _browser = (await puppeteer.launch({ headless: true })) as unknown as import('puppeteer-core').Browser;
  }
  return _browser;
}

/**
 * Render HTML to a PDF Buffer (A4, print-style).
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const buf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
    return Buffer.from(buf);
  } finally {
    await page.close().catch(() => {});
  }
}

// On process exit, close the browser cleanly so workers shut down fast.
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    try { await _browser?.close(); } catch { /* ignore */ }
  });
}
