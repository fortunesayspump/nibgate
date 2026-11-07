const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage();
    const calls = [];
    await page.route('**/hub/explore/content?*', async route => {
      const url = new URL(route.request().url());
      const cursor = url.searchParams.get('cursor');
      const skip = cursor ? Number(JSON.parse(cursor)[1].slice(4)) + 1 : 0;
      const limit = Number(url.searchParams.get('limit') || 100);
      calls.push(skip);
      const content = Array.from({length: Math.max(0, Math.min(limit, 110 - skip))}, (_, n) => {
        const id = `item${skip + n}`;
        return {id, identityScope:'creator-publication', title:`Synthetic ${id}`, description:'Fixture', imageUrl:'', contentType:'article', tags:'', url:`https://alpha.nibgate.xyz/writing/${id}`, price:0, views:null, unlocks:null, revenue:null, websiteName:'Alpha', websiteDomain:'alpha.nibgate.xyz', createdAt:null};
      });
      await route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({success:true,scope:'current-public-creator-articles',sort:'site-order',historyStatus:'unavailable-no-event-visibility-proof',pagination:'keyset-v1',nextCursor:skip + content.length < 110 ? JSON.stringify(['alpha.nibgate.xyz',`item${skip + content.length - 1}`]) : null,content})});
    });
    await page.goto('http://127.0.0.1:3025/explore', {waitUntil:'domcontentloaded'});
    await page.locator('#explore-query').fill('synthetic');
    await page.locator('#explore-query').press('Enter');
    await page.getByText('Synthetic item0', {exact:true}).waitFor();
    for (let i = 0; i < 10 && !calls.includes(100); i++) await page.getByRole('button', {name:'Load more'}).click();
    await page.getByText('Synthetic item100', {exact:true}).waitFor();
    if (!calls.includes(100)) throw new Error('Second page was not requested');
    console.log('Synthetic browser pagination passed: second page requested and rendered');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
