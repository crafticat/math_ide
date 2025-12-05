import puppeteer from 'puppeteer';

async function runTest() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  console.log('Opening app...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  await page.waitForSelector('.katex', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 500));

  console.log('\n--- PREVIEW OUTPUT (line by line) ---\n');

  const previewLines = await page.evaluate(() => {
    const katexElements = document.querySelectorAll('.katex-display .katex');
    const lines = [];
    katexElements.forEach((el, i) => {
      lines.push(`${i + 1}: ${el.textContent}`);
    });
    return lines;
  });

  previewLines.forEach(line => console.log(line));

  await page.screenshot({ path: 'test-output.png', fullPage: true });
  console.log('\nScreenshot saved to test-output.png');

  await browser.close();
}

runTest().catch(console.error);
