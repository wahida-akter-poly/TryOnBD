import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';

// Compile the actual renderer and detector for pixel-level browser checks.
// This bundle exists only in the test page; it is never a production route.
let harness;
test.beforeAll(async () => {
  const result = await build({
    write: false,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    define: { 'import.meta.env.BASE_URL': '"/"' },
    stdin: {
      resolveDir: process.cwd(),
      contents: `
      import { acquireFaceLandmarker } from './src/services/faceLandmarker.js';
      import { loadGlassesAssembly, loadAccessoryAsset } from './src/components/tryon/accessoryAssets.js';
      import { resolveHeadPose } from './src/components/tryon/headPose.js';
      import { faceAnchors, defaultControls, accessoryTransform, drawAccessory } from './src/components/tryon/faceGeometry.js';
      import { createEyewearRig, rigidTempleMesh } from './src/components/tryon/eyewearRig.js';
      import { accessoryStyles } from './src/data/faceAccessories.js';
      import { applyLensSurface } from './src/components/tryon/lensSurface.js';
      window.checkLensSurface = async () => {
        const style=accessoryStyles.find(s=>s.id==='aviator');
        const original=await loadAccessoryAsset(style.src,null,true);
        const asset=applyLensSurface(original,style.lensSurface);
        const canvas=document.createElement('canvas');canvas.width=1900;canvas.height=828;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(original.image,0,0);
        const pixel=(context,x,y)=>Array.from(context.getImageData(x,y,1,1).data);
        const points=[[355,360],[385,400],[420,450],[600,450]];
        const before=points.map(([x,y])=>pixel(ctx,x,y));
        const material=asset.image.getContext('2d');
        const after=points.map(([x,y])=>pixel(material,x,y));
        return {src:asset.src,source:asset.lensMaterial.source,before,after,
          originalHardware:pixel(ctx,80,328),hardware:pixel(material,80,328)};
      };
      window.checkEyewear = async () => {
        const image = new Image(); image.src = '/assets/portrait.jpg'; await image.decode();
        const lease = acquireFaceLandmarker();
        const found = await lease.detect(image, false); lease.release();
        if (!found?.matrix) throw new Error('Real face matrix unavailable');
        const fit = accessoryStyles.find(s=>s.id==='clear');
        const asset = await loadGlassesAssembly(fit.frontFrameSrc,fit.leftTempleSrc,fit.rightTempleSrc);
        const blank=document.createElement('canvas');blank.width=asset.image.width;blank.height=asset.image.height;
        const results=[];
        for(const degrees of [0,-15,15,-30,30]) {
          const r=degrees*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
          const matrix={rows:4,columns:4,data:[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]};
          const pose=resolveHeadPose(null,matrix,0,false,0);
          const anchor=faceAnchors(found.landmarks,image.width,image.height,'sunglasses',pose)[0];
          const controls=defaultControls();
          const transform=accessoryTransform(anchor,controls,image.width,image.height,asset.bounds.width/asset.bounds.height,fit);
          const rig=createEyewearRig(anchor,transform,fit);
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          // Isolate actual photographed temple pixels, excluding the front.
          drawAccessory(ctx,{...asset,image:blank},[anchor],controls,image.width,image.height,fit);
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          const counts={left:0,right:0,intrusion:0};
          let minX=Infinity,maxX=-Infinity;
          for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++) {
            if(pixels[(y*canvas.width+x)*4+3]<10)continue;
            const dx=x+0.5-transform.x,dy=y+0.5-transform.y;
            const lx=dx*Math.cos(transform.angle)+dy*Math.sin(transform.angle);
            if(lx>rig.front.leftHinge.x+1 && lx<rig.front.rightHinge.x-1)counts.intrusion++;
            if(lx<rig.front.leftHinge.x)counts.left++;else if(lx>rig.front.rightHinge.x)counts.right++;
            minX=Math.min(minX,lx);maxX=Math.max(maxX,lx);
          }
          const unmasked=document.createElement('canvas');unmasked.width=canvas.width;unmasked.height=canvas.height;
          const unmaskedCtx=unmasked.getContext('2d');
          drawAccessory(unmaskedCtx,{...asset,image:blank},[{...anchor,faceSurface:null}],controls,image.width,image.height,fit);
          const unmaskedPixels=unmaskedCtx.getImageData(0,0,canvas.width,canvas.height).data;
          let unmaskedCount=0;for(let i=3;i<unmaskedPixels.length;i+=4)if(unmaskedPixels[i]>=10)unmaskedCount++;
          const temples=rig.temples.map(t=>{
            const part=t.side<0?asset.leftTemple:asset.rightTemple;
            const mesh=rigidTempleMesh(rig,t,part),h=t.side<0?rig.front.leftHinge:rig.front.rightHinge;
            return {side:t.side,near:t.near,projection:t.projectedLengthRatio,opacity:t.opacity,
              jointError:Math.hypot(mesh.hinge.x-h.x,mesh.hinge.y-h.y),
              vector:t.vector,physicalLength:t.physicalLength,depth:t.target.depth-t.hingeDepth};
          });
          ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);
          drawAccessory(ctx,asset,[anchor],controls,image.width,image.height,fit);
          canvas.dataset.rigPose=String(degrees);canvas.style.width='720px';canvas.style.height='auto';
          document.body.append(canvas);
          results.push({degrees,counts,unmaskedCount,temples,renderer:canvas.dataset.eyewearRenderer,wingExtent:Number.isFinite(minX)?Math.max(0,
            rig.front.leftHinge.x-minX,maxX-rig.front.rightHinge.x)/transform.width:0});
        }
        return { actualMatrix: true, results };
      };
    `,
    },
  });
  harness = result.outputFiles[0].text;
  await mkdir('artifacts', { recursive: true });
});

const realFrames = {
  id: 2,
  name: 'Modern Clear Frame',
  arType: 'EYEWEAR',
  price: 1899,
  stockQuantity: 18,
  categoryId: 1,
  imageUrl: '/assets/face-ar/sunglasses/modern-clear-front-clean.png',
};
async function setup(page) {
  await page.route('**/api/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/api/products') return route.fulfill({ json: [realFrames] });
    if (p === '/api/products/2') return route.fulfill({ json: realFrames });
    if (p === '/api/categories')
      return route.fulfill({ json: [{ id: 1, categoryName: 'Eyewear' }] });
    return route.fulfill({ status: 401, json: { message: 'Sign in required' } });
  });
}

test('real PNG assembly: short frontal arms, attached turning hinges, no far-arm lens ghosts or exaggerated spinning', async ({
  page,
}) => {
  test.setTimeout(120000);
  await setup(page);
  await page.goto('/try-on?productId=2');
  await page.addScriptTag({ content: harness });
  const { results } = await page.evaluate(() => window.checkEyewear());
  console.log('Rigid projection pixel checks:', JSON.stringify(results));
  for (const [degrees, name] of [
    [0, 'frontal'],
    [-30, 'left'],
    [30, 'right'],
  ])
    await page
      .locator(`canvas[data-rig-pose="${degrees}"]`)
      .screenshot({ path: `artifacts/eyewear-rigid-${name}.png` });
  for (const r of results) {
    expect(r.renderer).toBe('WEBGL_FACE_DEPTH');
    expect(r.counts.left + r.counts.right).toBeLessThanOrEqual(r.unmaskedCount);
    if (r.degrees === 15) expect(r.counts.left + r.counts.right).toBeLessThan(r.unmaskedCount);
    expect(r.counts.intrusion, `${r.degrees}: temple reflected through lenses`).toBe(0);
    for (const t of r.temples) {
      expect(t.jointError).toBeLessThan(0.001);
      expect(t.depth).toBeGreaterThan(0.45);
    }
    if (r.degrees === 0) {
      expect(r.wingExtent).toBeLessThan(0.06);
      for (const t of r.temples) expect(t.projection).toBeLessThan(0.06);
    } else {
      const near = r.temples.find((t) => t.near),
        far = r.temples.find((t) => !t.near);
      expect(near.vector.x * near.side).toBeGreaterThan(0);
      expect(far.vector.x * far.side).toBeLessThan(0);
      expect(near.physicalLength).toBeCloseTo(far.physicalLength, 8);
      expect(near.projection).toBeLessThan(0.45);
      expect(r.counts[near.side < 0 ? 'left' : 'right']).toBeGreaterThan(40);
      expect(r.counts[far.side < 0 ? 'left' : 'right']).toBeLessThan(
        r.counts[near.side < 0 ? 'left' : 'right'],
      );
    }
  }
});

test('production eyewear uses selected backend image, actual MediaPipe fitting, export and hidden diagnostics', async ({
  page,
}) => {
  test.setTimeout(120000);
  await setup(page);
  await page.goto('/try-on?productId=2');
  await expect(page.getByText(realFrames.name, { exact: true })).toBeVisible();
  await expect(page.getByLabel('AR diagnostics')).toHaveCount(0);
  await page
    .getByLabel('Upload photo', { exact: true })
    .setInputFiles('tests/fixtures/ear-front.jpg');
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible({ timeout: 60000 });
  expect(await page.evaluate(() => window.__tryOnBridgeDebug)).toBeUndefined();
  await expect(page.getByLabel('Virtual try-on preview')).toHaveAttribute(
    'data-eyewear-renderer',
    'WEBGL_FACE_DEPTH',
  );
  await page.screenshot({ path: 'artifacts/eyewear-production-frontal.png', fullPage: true });
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const download = await event;
  expect(await download.failure()).toBeNull();
  await download.saveAs('artifacts/eyewear-production-capture.png');
});

test('eyewear diagnostics require the explicit flag and report the rigid geometry', async ({
  page,
}) => {
  test.setTimeout(120000);
  await setup(page);
  await page.goto('/try-on?productId=2&arDebug=1');
  await page
    .getByLabel('Upload photo', { exact: true })
    .setInputFiles('tests/fixtures/ear-front.jpg');
  await expect(page.getByLabel('AR diagnostics')).toBeVisible({ timeout: 60000 });
  await expect
    .poll(() => page.evaluate(() => window.__tryOnBridgeDebug?.temples[0]?.renderer))
    .toBe('RIGID_3D');
});

test('Canvas fallback keeps rigid fitting and export when WebGL is unavailable', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl' || type === 'webgl2' ? null : get.call(this, type, ...args);
    };
  });
  await setup(page);
  await page.goto('/try-on?productId=2');
  await page
    .getByLabel('Upload photo', { exact: true })
    .setInputFiles('tests/fixtures/ear-front.jpg');
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel('Virtual try-on preview')).toHaveAttribute(
    'data-eyewear-renderer',
    'CANVAS',
  );
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
});

test('eyewear simulated camera uses the mirrored 3D pose and captures exactly before releasing the stream', async ({
  page,
}) => {
  test.setTimeout(120000);
  await setup(page);
  const photo = await readFile('tests/fixtures/ear-front.jpg');
  await page.route('**/__eyewear-camera.jpg', (route) =>
    route.fulfill({ contentType: 'image/jpeg', body: photo }),
  );
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        window.cameraRequests++;
        const image = new Image();
        image.src = '/__eyewear-camera.jpg';
        await image.decode();
        const canvas = Object.assign(document.createElement('canvas'), { width: 640, height: 800 });
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, 640, 800);
        setInterval(() => ctx.drawImage(image, 0, 0, 640, 800), 40);
        const stream = canvas.captureStream(24);
        window.testCameraTrack = stream.getVideoTracks()[0];
        return stream;
      },
    });
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: async () => [],
    });
  });
  await page.goto('/try-on?productId=2');
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByText('Frame fitted', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel('Virtual try-on preview')).toHaveAttribute(
    'data-eyewear-renderer',
    'WEBGL_FACE_DEPTH',
  );
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByText('Captured', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.testCameraTrack.readyState)).toBe('ended');
  await expect(page.locator('video')).toHaveJSProperty('srcObject', null);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  expect((await event).suggestedFilename()).toBe('tryonbd-sunglasses-result.png');
});

test('real Aviator lens material removes baked rear-arm ghosts while keeping original frame hardware and URL', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/try-on?productId=2');
  await page.addScriptTag({ content: harness });
  const data = await page.evaluate(() => window.checkLensSurface());
  expect(data.src).toBe('/assets/face-ar/sunglasses/aviator-real.png');
  expect(data.source).toBe(data.src);
  expect(data.hardware).toEqual(data.originalHardware);
  // A dark rear arm differs in all colour channels, not only red.
  const contrast = Math.max(
    ...data.before.flatMap((a) =>
      data.before.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])),
    ),
  );
  expect(contrast).toBeGreaterThan(10);
  for (const pixel of data.after) {
    for (let c = 0; c < 3; c++)
      expect(Math.abs(pixel[c] - data.after[0][c])).toBeLessThanOrEqual(2);
    expect(pixel[3]).toBeGreaterThan(210);
    expect(pixel[3]).toBeLessThan(235);
  }
});
