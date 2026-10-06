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
      import { eyewearPoses, poseFixture } from './tests/fixtures/eyewearPose.js';
      import { faceMeshTriangles } from './src/components/tryon/eyewearWebGL.js';
      import { drawTempleQuad } from './src/components/tryon/templeGeometry.js';
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
        const basePose=resolveHeadPose(null,found.matrix,0,false,0);
        const base=faceAnchors(found.landmarks,image.width,image.height,'sunglasses',basePose)[0];
        const results=[];
        for(const pose of eyewearPoses) {
          const fixture=poseFixture(base,pose,fit),anchor=fixture.anchor;
          const controls={...defaultControls(),mirror:false};
          const transform=accessoryTransform(anchor,controls,image.width,image.height,asset.bounds.width/asset.bounds.height,fit);
          const rig=createEyewearRig(anchor,transform,fit);
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          const mask=document.createElement('canvas');mask.width=canvas.width;mask.height=canvas.height;
          const mctx=mask.getContext('2d');mctx.translate(transform.x,transform.y);mctx.rotate(transform.angle);
          drawTempleQuad(mctx,asset.lensOccluder,rig.front.mesh);
          const lens=mctx.getImageData(0,0,canvas.width,canvas.height).data;
          const counts={left:0,right:0,intrusion:0},roots={},unmasked={},headHidden={},headOnly={};
          let minX=Infinity,maxX=-Infinity;
          for(const side of [-1,1]) {
            const name=side<0?'left':'right';
            const solo={...asset,image:blank,leftTemple:side<0?asset.leftTemple:null,rightTemple:side>0?asset.rightTemple:null};
            ctx.clearRect(0,0,canvas.width,canvas.height);
            drawAccessory(ctx,solo,[anchor],controls,image.width,image.height,fit);
            const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
            const hinge=rig.screen(side<0?rig.front.leftHinge:rig.front.rightHinge);
            roots[name]=0;
            for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++) {
              const i=(y*canvas.width+x)*4+3;
              if(pixels[i]<20)continue;
              counts[name]++;
              if(lens[i]>250 && lens[i-4]>250 && lens[i+4]>250 && lens[i-canvas.width*4]>250 && lens[i+canvas.width*4]>250)counts.intrusion++;
              if(Math.hypot(x+.5-hinge.x,y+.5-hinge.y)<transform.width*.028) roots[name]++;
              const dx=x+.5-transform.x,dy=y+.5-transform.y,lx=dx*Math.cos(transform.angle)+dy*Math.sin(transform.angle);
              minX=Math.min(minX,lx);maxX=Math.max(maxX,lx);
            }
            ctx.clearRect(0,0,canvas.width,canvas.height);
            drawAccessory(ctx,{...solo,lensOccluder:null},[anchor],controls,image.width,image.height,fit);
            const headPixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
            headOnly[name]=0;for(let i=3;i<headPixels.length;i+=4)if(headPixels[i]>=20)headOnly[name]++;
            ctx.clearRect(0,0,canvas.width,canvas.height);
            drawAccessory(ctx,{...solo,lensOccluder:null},[{...anchor,faceSurface:null}],controls,image.width,image.height,fit);
            const raw=ctx.getImageData(0,0,canvas.width,canvas.height).data;
            unmasked[name]=0;headHidden[name]=0;
            for(let i=3;i<raw.length;i+=4)if(raw[i]>=20){unmasked[name]++;if(pixels[i]<20 && lens[i]<20)headHidden[name]++;}
          }
          const frameOnly={...asset,leftTemple:null,rightTemple:null};
          ctx.clearRect(0,0,canvas.width,canvas.height);
          drawAccessory(ctx,frameOnly,[anchor],controls,image.width,image.height,fit);
          const countAlpha=context=>{const px=context.getImageData(0,0,canvas.width,canvas.height).data;
            let count=0;for(let i=3;i<px.length;i+=4)if(px[i]>=20)count++;return count;};
          const framePixels=countAlpha(ctx);
          ctx.clearRect(0,0,canvas.width,canvas.height);
          drawAccessory(ctx,frameOnly,[{...anchor,faceSurface:null}],controls,image.width,image.height,fit);
          const unmaskedFrame=countAlpha(ctx);
          const temples=rig.temples.map(t=>{
            const part=t.side<0?asset.leftTemple:asset.rightTemple;
            const mesh=rigidTempleMesh(rig,t,part),h=t.side<0?rig.front.leftHinge:rig.front.rightHinge;
            return {side:t.side,near:t.near,projection:t.projectedLengthRatio,opacity:t.opacity,
              jointError:Math.hypot(mesh.hinge.x-h.x,mesh.hinge.y-h.y),
              vector:t.vector,physicalLength:t.physicalLength,depth:t.target.depth-t.hingeDepth};
          });
          ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#444';ctx.fillRect(0,0,canvas.width,canvas.height);
          // Map the actual face photograph onto its posed MediaPipe triangles.
          // Gray surrounds the mesh because the detector supplies neither hair nor ears.
          const triangleIds=Array.from({length:faceMeshTriangles.length/3},(_,i)=>Array.from(faceMeshTriangles.slice(i*3,i*3+3)));
          // Tessellation excludes the eye/mouth openings; texture their interiors
          // too so controlled face turns retain the real portrait's visible eyes.
          for(const ring of [[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],
            [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466],
            [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191]])
            for(let i=1;i+1<ring.length;i++) triangleIds.push([ring[0],ring[i],ring[i+1]]);
          triangleIds.sort((a,b)=>b.reduce((s,id)=>s+fixture.observed[id].z,0)-a.reduce((s,id)=>s+fixture.observed[id].z,0));
          for(const ids of triangleIds) {
            const src=ids.map(id=>({x:found.landmarks[id].x*image.width,y:found.landmarks[id].y*image.height})),dst=ids.map(id=>fixture.observed[id]);
            const [p0,p1,p2]=src,[q0,q1,q2]=dst,det=(p1.x-p0.x)*(p2.y-p0.y)-(p2.x-p0.x)*(p1.y-p0.y);
            if(Math.abs(det)<1e-6)continue;
            const ax=((q1.x-q0.x)*(p2.y-p0.y)-(q2.x-q0.x)*(p1.y-p0.y))/det,
              bx=((q2.x-q0.x)*(p1.x-p0.x)-(q1.x-q0.x)*(p2.x-p0.x))/det,
              ay=((q1.y-q0.y)*(p2.y-p0.y)-(q2.y-q0.y)*(p1.y-p0.y))/det,
              by=((q2.y-q0.y)*(p1.x-p0.x)-(q1.y-q0.y)*(p2.x-p0.x))/det;
            ctx.save();ctx.beginPath();dst.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();
            ctx.transform(ax,ay,bx,by,q0.x-ax*p0.x-bx*p0.y,q0.y-ay*p0.x-by*p0.y);ctx.drawImage(image,0,0);ctx.restore();
          }
          drawAccessory(ctx,asset,[anchor],controls,image.width,image.height,fit);
          canvas.dataset.rigPose=pose.name;canvas.style.width='720px';canvas.style.height='auto';
          document.body.append(canvas);
          results.push({pose,headFit:rig.headFit,headShape:base.headShape,baseYaw:base.rawYawDegrees,counts,roots,unmasked,headHidden,headOnly,framePixels,unmaskedFrame,temples,renderer:canvas.dataset.eyewearRenderer,wingExtent:Number.isFinite(minX)?Math.max(0,
            rig.front.leftHinge.x-minX,maxX-rig.front.rightHinge.x)/transform.width:0});
        }
        return {actualMatrix:true,assets:{left:asset.leftTemple.inspection,right:asset.rightTemple.inspection,lenses:asset.lensOutlines.length},results};

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

test('real photographed temples fit a coherently posed head at frontal, yaw, pitch and roll', async ({
  page,
}) => {
  test.setTimeout(120000);
  await setup(page);
  await page.goto('/try-on?productId=2');
  await page.addScriptTag({ content: harness });
  const data = await page.evaluate(() => window.checkEyewear());
  console.log('Head-side pose pixel checks:', JSON.stringify(data));
  for (const r of data.results)
    await page
      .locator(`canvas[data-rig-pose="${r.pose.name}"]`)
      .screenshot({ path: `artifacts/eyewear-head-side-${r.pose.name}.png` });
  expect(data.assets.lenses).toBe(2);
  for (const part of [data.assets.left, data.assets.right]) {
    expect(part.decoded).toBe(true);
    expect(part.visiblePixels).toBeGreaterThan(20000);
    expect(part.meanVisibleAlpha).toBeGreaterThan(0.6);
  }
  for (const r of data.results) {
    expect(r.renderer).toBe('WEBGL_FACE_DEPTH');
    expect(
      r.framePixels / r.unmaskedFrame,
      `${r.pose.name}: front fit lost to depth mask`,
    ).toBeGreaterThan(0.9);
    expect(r.counts.intrusion).toBe(0);
    for (const t of r.temples) {
      expect(t.jointError).toBeLessThan(0.001);
      expect(t.opacity).toBe(1);
      expect(t.depth).toBeGreaterThan(0.45);
    }
    if (r.pose.yaw === 0) {
      expect(r.counts.left).toBeGreaterThan(120);
      expect(r.counts.right).toBeGreaterThan(120);
      expect(r.roots.left).toBeGreaterThan(12);
      expect(r.roots.right).toBeGreaterThan(12);
      expect(r.wingExtent).toBeLessThan(0.11);
    } else {
      const near = r.temples.find((t) => t.near),
        far = r.temples.find((t) => !t.near),
        n = near.side < 0 ? 'left' : 'right',
        f = far.side < 0 ? 'left' : 'right';
      expect(r.counts[n]).toBeGreaterThan(120);
      expect(r.roots[n]).toBeGreaterThan(12);
      expect(r.counts[f]).toBeLessThan(r.counts[n]);
      expect(r.headOnly[f]).toBeLessThan(r.unmasked[f]);
      if (Math.abs(r.pose.yaw) === 30) expect(r.counts[f] / r.unmasked[f]).toBeLessThan(0.35);
    }
  }
  for (const sign of [-1, 1]) {
    const frontal = data.results.find(
      (r) => r.pose.yaw === 0 && r.pose.pitch === 0 && r.pose.roll === 0,
    );
    const fifteen = data.results.find((r) => r.pose.yaw === sign * 15),
      thirty = data.results.find((r) => r.pose.yaw === sign * 30);
    const near = sign > 0 ? 'left' : 'right',
      far = sign > 0 ? 'right' : 'left';
    expect(fifteen.counts[near]).toBeGreaterThan(frontal.counts[near]);
    expect(thirty.counts[near]).toBeGreaterThan(fifteen.counts[near]);
    expect(thirty.counts[far] / thirty.unmasked[far]).toBeLessThan(
      fifteen.counts[far] / fifteen.unmasked[far],
    );
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
