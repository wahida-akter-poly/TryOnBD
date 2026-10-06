// Depth-tested textured planes, with a real MediaPipe face mesh depth prepass.
// No second detector, synthetic product parts, Three.js dependency or camera.
import { FaceLandmarker } from '@mediapipe/tasks-vision';

const edges = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
export const faceMeshTriangles = new Uint16Array(
  Array.from({ length: edges.length / 3 }, (_, i) => [
    edges[i * 3].start,
    edges[i * 3].end,
    edges[i * 3 + 1].end,
  ]).flat(),
);
const renderers = new WeakMap();
const vertexSource = `
attribute vec4 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() { gl_Position = a_position; v_uv = a_uv; }
`;
const fragmentSource = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_alpha;
uniform bool u_depthOnly;
uniform bool u_aperture;
varying vec2 v_uv;
void main() {
  if (u_depthOnly && !u_aperture) { gl_FragColor = vec4(0.0); return; }
  vec4 color = texture2D(u_texture, v_uv);
  if (color.a < 0.01) discard;
  gl_FragColor = u_depthOnly ? vec4(0.0) : color * u_alpha;
}
`;

function createRenderer(canvas) {
  const surface = document.createElement('canvas');
  const gl = surface.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    depth: true,
  });
  if (!gl) return null;
  let program, buffer;
  const shaders = [],
    textures = new Map();
  const dispose = () => {
    for (const texture of textures.values()) gl.deleteTexture(texture);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    surface.removeEventListener('webglcontextlost', onLost);
    surface.removeEventListener('webglcontextrestored', onRestored);
  };
  const onLost = (event) => {
    event.preventDefault();
    renderer.lost = true;
  };
  const onRestored = () => {
    dispose();
    renderers.delete(canvas);
  };
  const renderer = { surface, gl, dispose, lost: false, textures };
  try {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error('Shader compilation failed');
      return shader;
    };
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed');
    buffer = gl.createBuffer();
    renderer.program = program;
    renderer.buffer = buffer;
    renderer.attributes = ['position', 'uv'].map((name) =>
      gl.getAttribLocation(program, `a_${name}`),
    );
    renderer.uniforms = Object.fromEntries(
      ['texture', 'alpha', 'depthOnly', 'aperture'].map((name) => [
        name,
        gl.getUniformLocation(program, `u_${name}`),
      ]),
    );
    surface.addEventListener('webglcontextlost', onLost);
    surface.addEventListener('webglcontextrestored', onRestored);
    return renderer;
  } catch {
    dispose();
    return null;
  }
}

export function releaseEyewearRenderer(canvas) {
  const renderer = renderers.get(canvas);
  renderer?.dispose();
  renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext();
  renderers.delete(canvas);
}

function textureFor(renderer, image) {
  if (renderer.textures.has(image)) return renderer.textures.get(image);
  const gl = renderer.gl,
    texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  renderer.textures.set(image, texture);
  return texture;
}

function vertex(point, uv, rig, transform, width, height) {
  const p = rig.screen(point),
    w = 1 / (point.perspective ?? 1);
  // Homogeneous w preserves perspective-correct UV interpolation in WebGL.
  // Depth is measured relative to the nose bridge in object-width units.
  // Actual pinhole near/far depth: (A*z+B)/(distance+z). Both observed
  // face vertices and projected product vertices use this same camera space.
  const near = rig.distance - 2,
    far = rig.distance + 3;
  const cameraZ = rig.distance + point.depth;
  const z = (far + near) / (far - near) - (2 * far * near) / ((far - near) * cameraZ);
  return [((p.x / width) * 2 - 1) * w, (1 - (p.y / height) * 2) * w, z * w, w, uv.x, uv.y, point.x];
}

function planeVertices(mesh, part, rig, transform, width, height) {
  const values = [],
    b = part.bounds,
    iw = part.image.width || part.image.naturalWidth,
    ih = part.image.height || part.image.naturalHeight,
    n = mesh.strips.length;
  for (let i = 0; i < n; i++) {
    const quad = mesh.strips[i];
    const uv = [
      { x: (b.x + (mesh.columns?.[i] ?? i / n) * b.width) / iw, y: b.y / ih },
      { x: (b.x + (mesh.columns?.[i + 1] ?? (i + 1) / n) * b.width) / iw, y: b.y / ih },
      {
        x: (b.x + (mesh.columns?.[i + 1] ?? (i + 1) / n) * b.width) / iw,
        y: (b.y + b.height) / ih,
      },
      { x: (b.x + (mesh.columns?.[i] ?? i / n) * b.width) / iw, y: (b.y + b.height) / ih },
    ];
    for (const j of [0, 1, 2, 0, 2, 3])
      values.push(...vertex(quad[j], uv[j], rig, transform, width, height));
  }
  return new Float32Array(values);
}

function faceVertices(anchor, rig, transform, width, height) {
  if (!anchor.faceSurface?.length || anchor.faceSurface.length < 468) return null;
  const values = [];
  for (const id of faceMeshTriangles) {
    const p = anchor.faceSurface[id];
    if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) return null;
    const delta = anchor.angle - transform.angle;
    const offsetX =
      (anchor.x - transform.x) * Math.cos(transform.angle) +
      (anchor.y - transform.y) * Math.sin(transform.angle);
    const offsetY =
      -(anchor.x - transform.x) * Math.sin(transform.angle) +
      (anchor.y - transform.y) * Math.cos(transform.angle);
    const q = {
      x: offsetX + anchor.width * (p.x * Math.cos(delta) - p.y * Math.sin(delta)),
      y: offsetY + anchor.width * (p.x * Math.sin(delta) + p.y * Math.cos(delta)),
      depth: (p.z * anchor.width) / rig.physicalWidth,
      perspective: 1,
    };
    values.push(...vertex(q, { x: 0, y: 0 }, rig, transform, width, height));
  }
  return new Float32Array(values);
}

export function renderEyewearWebGL(ctx, asset, anchor, transform, rig, meshes) {
  const canvas = ctx.canvas;
  if (!canvas || typeof document === 'undefined') return false;
  if (!renderers.has(canvas)) renderers.set(canvas, createRenderer(canvas));
  const renderer = renderers.get(canvas);
  if (!renderer || renderer.lost) return false;
  const { gl, surface, program, buffer, uniforms, attributes } = renderer;
  try {
    const width = canvas.width,
      height = canvas.height;
    if (surface.width !== width || surface.height !== height) {
      surface.width = width;
      surface.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (let i = 0; i < 2; i++) {
      gl.enableVertexAttribArray(attributes[i]);
      gl.vertexAttribPointer(attributes[i], [4, 2, 1][i], gl.FLOAT, false, 28, [0, 16, 24][i]);
    }
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.uniform1i(uniforms.texture, 0);
    gl.activeTexture(gl.TEXTURE0);
    // A complete texture is required by WebGL even for the depth-only branch.
    gl.bindTexture(gl.TEXTURE_2D, textureFor(renderer, asset.image));
    gl.uniform1i(uniforms.aperture, 0);
    const face = faceVertices(anchor, rig, transform, width, height);
    if (face) {
      gl.colorMask(false, false, false, false);
      gl.uniform1i(uniforms.depthOnly, 1);
      // The posterior head closes the open face surface; both write real depth.
      const shell = new Float32Array(
        rig.headShell.flatMap((p) => vertex(p, { x: 0, y: 0 }, rig, transform, width, height)),
      );
      gl.bufferData(gl.ARRAY_BUFFER, shell, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, shell.length / 7);
      gl.bufferData(gl.ARRAY_BUFFER, face, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, face.length / 7);
    }
    if (asset.lensOccluder) {
      gl.colorMask(false, false, false, false);
      gl.uniform1i(uniforms.depthOnly, 1);
      gl.uniform1i(uniforms.aperture, 1);
      gl.bindTexture(gl.TEXTURE_2D, textureFor(renderer, asset.lensOccluder.image));
      const aperture = planeVertices(
        rig.front.mesh,
        asset.lensOccluder,
        rig,
        transform,
        width,
        height,
      );
      gl.bufferData(gl.ARRAY_BUFFER, aperture, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, aperture.length / 7);
    }
    gl.colorMask(true, true, true, true);
    gl.uniform1i(uniforms.depthOnly, 0);
    gl.uniform1i(uniforms.aperture, 0);
    // Translucent photographs test against opaque face/head/lens depth but do
    // not write it: antialiased/clear texels cannot mask another product surface.
    gl.depthMask(false);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const usedImages = new Set([
      asset.image,
      asset.lensOccluder?.image,
      asset.leftTemple?.image,
      asset.rightTemple?.image,
    ]);
    for (const [image, texture] of renderer.textures)
      if (!usedImages.has(image)) {
        gl.deleteTexture(texture);
        renderer.textures.delete(image);
      }
    const draw = (mesh, part, alpha) => {
      if (!mesh) return;
      gl.bindTexture(gl.TEXTURE_2D, textureFor(renderer, part.image));
      gl.uniform1f(uniforms.alpha, alpha);
      const data = planeVertices(mesh, part, rig, transform, width, height);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, data.length / 7);
    };
    for (const temple of rig.temples) {
      const part = temple.side < 0 ? asset.leftTemple : asset.rightTemple;
      if (part && temple.opacity > 0)
        draw(meshes.get(temple.side).posterior, part, transform.opacity * temple.opacity);
    }
    // Front fit remains on the original face/head depth buffer.
    gl.depthMask(false);
    draw(rig.front.mesh, asset, transform.opacity);
    // Hybrid proximal pass: only the calibrated root section is protected from
    // face/head depth. Real front pixels and lens apertures still occlude it.
    // The far-side section shrinks smoothly with yaw at an exact texture seam.
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.colorMask(false, false, false, false);
    gl.disable(gl.BLEND);
    gl.uniform1i(uniforms.depthOnly, 1);
    gl.uniform1i(uniforms.aperture, 1);
    const guard = (part) => {
      if (!part) return;
      gl.bindTexture(gl.TEXTURE_2D, textureFor(renderer, part.image));
      const data = planeVertices(rig.front.mesh, part, rig, transform, width, height);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, data.length / 7);
    };
    guard(asset);
    guard(asset.lensOccluder);
    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.uniform1i(uniforms.depthOnly, 0);
    gl.uniform1i(uniforms.aperture, 0);
    gl.enable(gl.BLEND);
    for (const temple of rig.temples) {
      const part = temple.side < 0 ? asset.leftTemple : asset.rightTemple;
      if (part && temple.opacity > 0)
        draw(meshes.get(temple.side).proximal, part, transform.opacity * temple.opacity);
    }
    if (gl.isContextLost()) return false;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(surface, 0, 0);
    ctx.restore();
    if (canvas.dataset) canvas.dataset.eyewearRenderer = face ? 'WEBGL_FACE_DEPTH' : 'WEBGL';
    return true;
  } catch {
    // Canvas remains usable after context/shader/texture failures.
    releaseEyewearRenderer(canvas);
    renderers.set(canvas, null);
    return false;
  }
}
