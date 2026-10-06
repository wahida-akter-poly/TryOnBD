import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const products = await Promise.all([
  ['eyewear/modern-clear-frame',2], ['eyewear/golden-frame',6],
  ['clothing/black-t-shirt',1], ['jewelry/silver-diamond-necklace',4],
].map(async ([slug,id]) => {
  const manifest = JSON.parse(await readFile(`public/assets/products/${slug}/product.json`, 'utf8'));
  const base = `/assets/products/${slug}/`;
  return { ...manifest, id, categoryId: 1, imageUrl: base + manifest.frontAsset,
    arMetadata: { ...manifest, frontAsset: base + manifest.frontAsset, leftTempleAsset: manifest.leftTempleAsset ? base + manifest.leftTempleAsset : undefined, rightTempleAsset: manifest.rightTempleAsset ? base + manifest.rightTempleAsset : undefined, gallery: manifest.gallery?.map(name => base + name) } };
}));
async function setup(page, live = false) {
  await page.route('**/assets/products/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ contentType: path.endsWith('.webp') ? 'image/webp' : 'image/png', body: await readFile(`public${path}`) });
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if(path === '/api/products') return route.fulfill({json: products});
    if(path === '/api/categories') return route.fulfill({json: [{id:1,categoryName:'Eyewear'}]});
    if(path.startsWith('/api/products/')) return route.fulfill({json:products.find(p=>p.id === Number(path.split('/').at(-1)))});
    return route.fulfill({status:401,json:{message:'Sign in required'}});
  });
  await page.addInitScript(({ live }) => {
    window.modalStreams = [];
    navigator.mediaDevices.getUserMedia = async () => {
      if (!live) throw Object.assign(new Error('Permission denied'), {name:'NotAllowedError'});
      const image = new Image(); image.src='/assets/portrait.jpg'; await image.decode();
      const canvas = document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context = canvas.getContext('2d'); context.drawImage(image,0,0);
      const stream = canvas.captureStream(12);
      const timer = setInterval(()=>context.drawImage(image,0,0),80);
      const track = stream.getVideoTracks()[0], stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); };
      window.modalStreams.push(stream);
      return stream;
    };
  }, {live});
}
for (const product of products.filter(p=>p.arType==='EYEWEAR')) test(`${product.name}: live modal, PD, fullscreen, capture, release and gallery preservation`, async ({page}) => {
  test.setTimeout(120000);
  console.log('modal test started');
  await setup(page,true);
  console.log('routes installed');
  await page.goto(`/products/${product.id}`);
  console.log('details loaded');
  await page.locator('.gallery-thumbnails button').nth(1).click();
  const selected = await page.locator('.gallery-main img').getAttribute('src');
  const beforeScroll = await page.evaluate(()=>window.scrollY);
  await page.getByRole('button',{name:'Try Virtually',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:product.name,exact:true});
  await expect(dialog).toBeVisible();
  console.log('dialog visible');
  await expect(page).toHaveURL(new RegExp(`/products/${product.id}\\?tryOn=true$`));
  expect(new URL(page.url()).pathname).toBe(`/products/${product.id}`);
  await expect(page.locator('body')).toHaveCSS('overflow','hidden');
  await expect(dialog.getByText('Frame fitted',{exact:true})).toBeVisible({timeout:60000});
  console.log('frame fitted');
  await expect(dialog.getByLabel('Pupillary distance',{exact:true})).toHaveText(/\d+\.\d mm/);
  await expect(page.getByLabel('Virtual try-on preview')).toHaveAttribute('data-eyewear-renderer','WEBGL_FACE_DEPTH');
  await dialog.getByLabel('Manual PD',{exact:true}).fill('65.5');
  await expect(dialog.getByLabel('Pupillary distance',{exact:true})).toHaveText('65.5 mm');
  await dialog.getByRole('button',{name:'Enter fullscreen'}).click();
  await expect(dialog.getByRole('button',{name:'Exit fullscreen'})).toBeVisible();
  await dialog.getByRole('button',{name:'Exit fullscreen'}).click();
  await dialog.getByRole('button',{name:'Capture',exact:true}).click();
  await expect(dialog.getByText('Captured',{exact:true})).toBeVisible();
  const download=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Download PNG',exact:true}).click();
  expect(await (await download).failure()).toBeNull();
  await dialog.getByRole('button',{name:'Retake',exact:true}).click();
  await expect(dialog.getByText('Frame fitted',{exact:true})).toBeVisible({timeout:60000});
  await page.screenshot({path:`artifacts/modal-${product.id}.png`});
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/products/${product.id}$`));
  expect(new URL(page.url()).pathname).toBe(`/products/${product.id}`);
  expect(await page.evaluate(()=>window.modalStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  expect(await page.locator('.gallery-main img').getAttribute('src')).toBe(selected);
  expect(await page.evaluate(()=>window.scrollY)).toBe(beforeScroll);
  await expect(page.getByRole('button',{name:'Try Virtually',exact:true})).toBeFocused();
});
for(const product of products.filter(p=>p.arType!=='EYEWEAR')) test(`${product.name}: mobile modal photo flow, no PD and same-page close`,async({page})=>{
  test.setTimeout(120000); await setup(page); await page.setViewportSize({width:375,height:812});
  await page.goto(`/products/${product.id}?tryOn=true`);
  const dialog=page.getByRole('dialog',{name:product.name,exact:true});
  await expect(dialog).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/products/${product.id}`);
  await expect(dialog.getByLabel('Manual PD',{exact:true})).toHaveCount(0);
  await expect(dialog.getByLabel(product.arType==='SHIRT'?'T-shirt try-on canvas':'Necklace try-on canvas')).toHaveCount(1);
  await page.getByLabel('Upload photo',{exact:true}).setInputFiles('tests/fixtures/shirt-hands-on-hips.jpg');
  await expect(dialog.getByText(product.arType==='SHIRT'?'Torso fitted':'Pose detected',{exact:true})).toBeVisible({timeout:60000});
  await expect(dialog.getByLabel(product.arType==='SHIRT'?'T-shirt try-on canvas':'Necklace try-on canvas')).toBeVisible();
  const bounds=await dialog.boundingBox(); expect(bounds.width).toBeLessThanOrEqual(375);expect(bounds.height).toBeLessThanOrEqual(812);
  const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download PNG',exact:true}).click();expect(await(await download).failure()).toBeNull();
  await dialog.getByRole('button',{name:'Close virtual try-on'}).click();await expect(page).toHaveURL(new RegExp(`/products/${product.id}$`));
});
test('eyewear modal shows unavailable PD and can reopen without leaving Product Details', async ({page})=>{
  const product=products.find(p=>p.arType==='EYEWEAR');
  await setup(page,false);
  await page.goto(`/products/${product.id}`);
  await page.getByRole('button',{name:'Try Virtually',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:product.name,exact:true});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Pupillary distance',{exact:true})).toHaveText('PD --');
  await expect(dialog.getByRole('alert')).toContainText('Camera permission denied');
  await page.getByRole('button',{name:'Close virtual try-on'}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Try Virtually',exact:true}).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Pupillary distance',{exact:true})).toHaveText('PD --');
  expect(new URL(page.url()).pathname).toBe(`/products/${product.id}`);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
