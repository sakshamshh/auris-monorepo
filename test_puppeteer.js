const puppeteer = require(require('child_process').execSync('npm root -g').toString().trim() + '/puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', req => console.log('REQ FAIL:', req.url()));
  await page.goto('http://localhost:3000', {waitUntil: 'networkidle0'});
  await page.type('#password', 'PandatThelka');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({path: 'screenshot.png'});
  console.log('Saved screenshot.png');
  await browser.close();
  process.exit(0);
})();
