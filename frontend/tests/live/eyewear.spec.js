import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test('live Golden Frame and Modern Clear APIs, storefront, details and own-asset try-on', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  await mkdir('artifacts', { recursive: true });
  const response = await request.get('/api/products');
  expect(response.ok()).toBe(true);
  const products = await response.json();
  for (const name of ['Golden Frame', 'Modern Clear Frame']) {
    const matches = products.filter((p) => p.name === name);
    expect(matches).toHaveLength(1);
    const product = matches[0];
    const byId = await request.get('/api/products/' + product.id);
    expect(byId.ok()).toBe(true);
    expect(await byId.json()).toEqual(product);
    if (name === 'Golden Frame')
      expect(product).toMatchObject({
        price: 2199,
        stockQuantity: 15,
        sellerId: 2,
        sellerName: 'Anzara',
        categoryName: 'Eyewear',
        arType: 'EYEWEAR',
      });
    expect(product.arMetadata.frontAsset).toBe(product.imageUrl);
    for (const key of ['frontAsset', 'leftTempleAsset', 'rightTempleAsset']) {
      const image = await request.get(product.arMetadata[key]);
      expect(image.ok()).toBe(true);
      expect(image.headers()['content-type']).toContain('image/png');
      expect([...(await image.body()).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
    await page.goto('/products?group=Eyewear');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    const card = page
      .locator('.product-card')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect
      .poll(() => card.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    await card.getByRole('link', { name: 'View Details', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/products/' + product.id + '$'));
    await expect(page.getByRole('img', { name, exact: true })).toHaveAttribute(
      'src',
      product.imageUrl,
    );
    await expect(page.getByText('Sold by ' + product.sellerName, { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in to shop', exact: true })).toBeVisible();
    await expect(page.getByText(product.stockQuantity + ' available', {exact:true})).toBeVisible();
    await page.getByRole('button', { name: 'Try Virtually', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/products/' + product.id + '[?]tryOn=true$'));
    await page
      .getByLabel('Upload photo', { exact: true })
      .setInputFiles('tests/fixtures/ear-front.jpg');
    await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible({ timeout: 60000 });
    await expect(page.getByLabel('Virtual try-on preview')).toHaveAttribute(
      'data-eyewear-renderer',
      'WEBGL_FACE_DEPTH',
    );
    await expect(page.getByLabel('AR diagnostics')).toHaveCount(0);
    await page.screenshot({
      path: 'artifacts/live-eyewear-' + product.id + '.png',
      fullPage: true,
    });
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
    const download = await event;
    expect(await download.failure()).toBeNull();
    await download.saveAs('artifacts/live-eyewear-' + product.id + '-capture.png');
  }
});


test('live existing shirt keeps its backend-driven pose fitting',async({page,request})=>{
 const products=await (await request.get('/api/products')).json();
 const shirt=products.find(p=>p.arType==='SHIRT');expect(shirt).toBeTruthy();
 await page.goto('/products/'+shirt.id);await page.getByRole('button',{name:'Try Virtually',exact:true}).click();
 await page.getByLabel('Upload photo',{exact:true}).setInputFiles('tests/fixtures/shirt-hands-on-hips.jpg');
 await expect(page.getByText('Torso fitted',{exact:true})).toBeVisible({timeout:60000});
 await page.screenshot({path:'artifacts/live-eyewear-fix-shirt-regression.png',fullPage:true});
});
