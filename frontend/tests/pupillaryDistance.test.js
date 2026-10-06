import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePD, smoothPD, pdScale } from '../src/components/tryon/pupillaryDistance.js';

const matrix = { rows: 4, columns: 4, data: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] };
function face(mm = 65.5, scale = 1) {
  const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
  const pupil = mm * 2 * scale;
  const iris = 11.7 * 2 * scale;
  for (const [center, a, b, top, bottom, outer, inner, sign] of [[468,469,471,159,145,33,133,-1], [473,474,476,386,374,263,362,1]]) {
    const x = 500 + sign * pupil / 2;
    for (const [i, dx, dy] of [[center,0,0],[a,-iris/2,0],[b,iris/2,0],[top,0,-6*scale],[bottom,0,6*scale],[outer,-20*scale,0],[inner,20*scale,0]]) points[i] = { x: (x + dx) / 1000, y: (500 + dy) / 1000 };
  }
  return points;
}
test('iris reference estimates PD independently of camera distance and image aspect', () => {
  for (const scale of [.5, 1, 2]) assert.ok(Math.abs(measurePD(face(65.5,scale),1000,1000,matrix).rawMm - 65.5) < .001);
  const points = face();
  for (const p of points) p.y /= 2;
  assert.ok(Math.abs(measurePD(points,1000,2000,matrix).rawMm - 65.5) < .001);
});
test('unreliable, missing, blink, out-of-range and turned measurements are rejected', () => {
  assert.equal(measurePD([],1000,1000,matrix),null);
  assert.equal(measurePD(face(90),1000,1000,matrix),null);
  assert.equal(measurePD(face(),1000,1000,null),null);
  const blink = face(); blink[159] = blink[145];
  assert.equal(measurePD(blink,1000,1000,matrix),null);
  const turned = { ...matrix, data: [...matrix.data] };
  const a = Math.PI / 6; turned.data[0] = turned.data[10] = Math.cos(a); turned.data[2] = -Math.sin(a); turned.data[8] = Math.sin(a);
  assert.equal(measurePD(face(),1000,1000,turned),null);
});
test('smoothing limits jumps, converges and clears immediately on loss', () => {
  let value = smoothPD(null,{ rawMm: 60, pupilPixels: 120 },0);
  value = smoothPD(value,{rawMm:70,pupilPixels:140},33);
  assert.ok(value.mm > 60 && value.mm < 60.2);
  for(let t=66;t<=5000;t+=33) value = smoothPD(value,{rawMm:70,pupilPixels:140},t);
  assert.ok(value.mm > 69.9);
  assert.equal(smoothPD(value,null,5033),null);
});
test('manual PD takes priority with bounded whole-frame correction and fit fallback', () => {
  const value = { rawMm: 65.5, mm: 65.5 };
  assert.equal(pdScale(value,null),1);
  assert.ok(pdScale(value,70) < 1);
  assert.ok(pdScale(value,60) > 1);
  assert.equal(pdScale(value,1),1);
  assert.equal(pdScale(null,60),1);
  assert.equal(pdScale(value,45),1.05);
});
