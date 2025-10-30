import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

/* ---------- DOM ---------- */
const loaderEl = document.getElementById('loader');
const sidebar = document.getElementById('sidebar');
const gearBtn = document.getElementById('gearBtn');

const fabricSel = document.getElementById('fabric');
const colorInput = document.getElementById('color');
const quickSwatches = document.getElementById('quickSwatches');

const roughR = document.getElementById('roughness');
const sheenR = document.getElementById('sheen');
const sheenRR = document.getElementById('sheenR');
const normalR = document.getElementById('normalScale');
const weaveR = document.getElementById('weaveRepeat');

const roughV = document.getElementById('roughnessV');
const sheenV = document.getElementById('sheenV');
const sheenRV = document.getElementById('sheenRV');
const normalV = document.getElementById('normalV');
const weaveV = document.getElementById('weaveV');

const partsPanel = document.getElementById('customizer-panel');
const toggleBottom = document.getElementById('toggleBottom');
const partsContainer = document.getElementById('parts-container');
const palettesContainer = document.getElementById('palettes-container');

/* ---------- Scene ---------- */
const canvas = document.querySelector('#c');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9eef2');

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.outputEncoding = THREE.SRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 1.25);
key.position.set(-5, 10, 10);
scene.add(key);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

/* ---------- Fabric maps & presets ---------- */
const exrLoader = new EXRLoader();
const texLoader = new THREE.TextureLoader();
const cache = new Map();

function loadTex(path, repeat=2) {
  const key = `${path}|${repeat}`; if (cache.has(key)) return cache.get(key);
  const isEXR = path.toLowerCase().endsWith('.exr');
  const loader = isEXR ? exrLoader : texLoader;
  const t = loader.load(path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  cache.set(key, t); return t;
}

const FOLDERS = {
  cotton: '/textures/cotton',
  silk:   '/textures/silk',
  denim:  '/textures/denim'
};

const PRESETS = {
  cotton: { color: '#ffffff', roughness: 0.68, sheen: 0.20, sheenR: 0.90, normalScale: 0.80, repeat: 2 },
  silk:   { color: '#fff5e1', roughness: 0.35, sheen: 0.85, sheenR: 0.25, normalScale: 0.35, repeat: 2 },
  denim:  { color: '#2f4f7f', roughness: 0.55, sheen: 0.15, sheenR: 0.60, normalScale: 1.30, repeat: 3 }
};

const QUICK_COLORS = ['#ffffff','#222222','#f0e6d6','#c8b7a6','#0b5ed7','#2f4f7f','#c0392b','#8e44ad','#27ae60','#f1c40f'];

/* ---------- State ---------- */
let shirtMesh = null;
let modelRoot = null;
let currentFabric = 'cotton';
const state = { ...PRESETS[currentFabric] };
let mat = null;

/* ---------- Camera Fit & Smooth Zoom ---------- */
let fitAnim = null; // {t:0..1, startPos, endPos, startTarget, endTarget, duration, startTime}
function fitCameraToObject(object, margin = 1.15, duration = 1200, orbitDuring = true) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Required distance to fit object on screen
  const maxSize = Math.max(size.x, size.y, size.z);
  const fitHeightDistance = (maxSize * margin) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
  const fitWidthDistance = (maxSize * margin) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) / camera.aspect;
  const distance = Math.max(fitHeightDistance, fitWidthDistance);

  // Keep direction from current camera to target; default along Z if degenerate
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  if (!isFinite(dir.lengthSq()) || dir.lengthSq() === 0) dir.set(0, 0, 1);

  const endPos = new THREE.Vector3().copy(center).addScaledVector(dir, distance);
  const endTarget = center.clone();

  // Prepare animation
  fitAnim = {
    startPos: camera.position.clone(),
    endPos,
    startTarget: controls.target.clone(),
    endTarget,
    duration,
    startTime: performance.now()
  };

  // Optional: slightly faster auto-rotate during intro, then slow down
  if (orbitDuring) {
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    setTimeout(() => { controls.autoRotateSpeed = 0.35; }, duration + 200);
  }
}

function updateFitAnimation() {
  if (!fitAnim) return;
  const now = performance.now();
  const t = Math.min(1, (now - fitAnim.startTime) / fitAnim.duration);
  const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // easeInOutQuad

  camera.position.lerpVectors(fitAnim.startPos, fitAnim.endPos, ease);
  controls.target.lerpVectors(fitAnim.startTarget, fitAnim.endTarget, ease);
  controls.update();

  if (t >= 1) fitAnim = null;
}

/* ---------- Material Building ---------- */
function fabricMaps(key, repeat) {
  const folder = FOLDERS[key];
  return {
    normal: loadTex(`${folder}/normal.exr`, repeat),
    rough:  loadTex(`${folder}/roughness.exr`, repeat),
    ao:     loadTex(`${folder}/ao.jpg`, repeat)
  };
}

function rebuildMaterial() {
  if (!shirtMesh) return;
  const maps = fabricMaps(currentFabric, state.repeat);

  if (mat) mat.dispose();
  mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(state.color),  // color from code
    normalMap: maps.normal,
    roughnessMap: maps.rough,
    aoMap: maps.ao,
    metalness: 0.0,
    roughness: state.roughness,
    sheen: state.sheen,
    sheenRoughness: state.sheenR
  });
  mat.normalScale = new THREE.Vector2(state.normalScale, state.normalScale);

  // ensure uv2 for AO
  const g = shirtMesh.geometry;
  if (g && !g.attributes.uv2 && g.attributes.uv) {
    g.setAttribute('uv2', new THREE.BufferAttribute(g.attributes.uv.array, 2));
  }

  shirtMesh.material = mat;
  shirtMesh.material.needsUpdate = true;

  // UI numbers
  roughV.textContent = state.roughness.toFixed(2);
  sheenV.textContent = state.sheen.toFixed(2);
  sheenRV.textContent = state.sheenR.toFixed(2);
  normalV.textContent = state.normalScale.toFixed(2);
  weaveV.textContent = String(state.repeat);
}

/* ---------- Sidebar interactions ---------- */
gearBtn.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  controls.autoRotate = !open; // pause while adjusting
});

fabricSel.addEventListener('change', () => {
  currentFabric = fabricSel.value;
  Object.assign(state, PRESETS[currentFabric]);
  colorInput.value = toHex(state.color);
  roughR.value = state.roughness; sheenR.value = state.sheen; sheenRR.value = state.sheenR;
  normalR.value = state.normalScale; weaveR.value = state.repeat;
  rebuildMaterial();
});

colorInput.addEventListener('input', () => { state.color = colorInput.value; rebuildMaterial(); });
roughR.addEventListener('input', () => { state.roughness = parseFloat(roughR.value); rebuildMaterial(); });
sheenR.addEventListener('input', () => { state.sheen = parseFloat(sheenR.value); rebuildMaterial(); });
sheenRR.addEventListener('input', () => { state.sheenR = parseFloat(sheenRR.value); rebuildMaterial(); });
normalR.addEventListener('input', () => { state.normalScale = parseFloat(normalR.value); rebuildMaterial(); });
weaveR.addEventListener('input', () => { state.repeat = parseInt(weaveR.value, 10); rebuildMaterial(); });

document.getElementById('reset').addEventListener('click', () => {
  Object.assign(state, PRESETS[currentFabric]);
  colorInput.value = toHex(state.color);
  roughR.value = state.roughness; sheenR.value = state.sheen; sheenRR.value = state.sheenR;
  normalR.value = state.normalScale; weaveR.value = state.repeat;
  rebuildMaterial();
});

document.getElementById('randomize').addEventListener('click', () => {
  const h = Math.random(), s = 0.45 + Math.random()*0.35, l = 0.45 + Math.random()*0.25;
  state.color = hslToHex(h,s,l);
  state.roughness = clamp(state.roughness + (Math.random()-0.5)*0.2, 0, 1);
  state.sheen = clamp(state.sheen + (Math.random()-0.5)*0.2, 0, 1);
  state.sheenR = clamp(state.sheenR + (Math.random()-0.5)*0.2, 0, 1);
  state.normalScale = clamp(state.normalScale + (Math.random()-0.5)*0.4, 0, 2);
  state.repeat = Math.max(1, Math.min(6, state.repeat + (Math.random()<0.5?-1:1)));
  colorInput.value = toHex(state.color);
  roughR.value = state.roughness; sheenR.value = state.sheen; sheenRR.value = state.sheenR;
  normalR.value = state.normalScale; weaveR.value = state.repeat;
  rebuildMaterial();
});

/* ---------- Quick color swatches ---------- */
QUICK_COLORS.forEach(hex => {
  const e = document.createElement('div');
  e.className = 'swatch'; e.style.background = hex;
  e.addEventListener('click', () => { state.color = hex; colorInput.value = hex; rebuildMaterial(); });
  quickSwatches.appendChild(e);
});

/* ---------- Bottom panel (original parts UI) ---------- */
toggleBottom.addEventListener('click', () => {
  const open = partsPanel.classList.toggle('panel-open');
  controls.autoRotate = !open;
});

function buildPartsUI(model) {
  const names = {
    "Cotton_Twill_FRONT_289623": "Shirt",
    "Material15575": "Buttons",
    "Material15577": "Thread",
    "Material15595": "Cuffs",
    "Material15597": "Cuffs Thread"
  };
  const swatches = ['#ffffff','#222','#B5A691','#883939','#3b5998','#5D76A9','#F2E5D7','#8E625A','#A1A1A1','#4F4F4F'];

  const mats = [];
  model.traverse(n => {
    if (n.isMesh && n.material && names[n.material.name]) {
      if (!mats.some(m => m.name === n.material.name)) mats.push(n.material);
    }
  });

  mats.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = 'part-button'; btn.textContent = names[m.name];
    partsContainer.appendChild(btn);

    const pal = document.createElement('div');
    pal.className = 'color-palette'; palettesContainer.appendChild(pal);

    swatches.forEach(c => {
      const s = document.createElement('div');
      s.className = 'color-swatch'; s.style.backgroundColor = c;
      s.addEventListener('click', () => {
        m.color.set(c);
        [...pal.children].forEach(x => x.classList.remove('active'));
        s.classList.add('active');
      });
      pal.appendChild(s);
    });

    if (i === 0) {
      btn.classList.add('active'); pal.classList.add('active');
      pal.children[0].classList.add('active');
    }
    btn.addEventListener('click', () => {
      document.querySelectorAll('.part-button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.color-palette').forEach(p=>p.classList.remove('active'));
      pal.classList.add('active');
    });
  });
}

/* ---------- GLB load ---------- */
const loader = new GLTFLoader();
loader.load("Men's Shirt.glb", (gltf) => {
  modelRoot = gltf.scene; scene.add(modelRoot);

  modelRoot.traverse(n => {
    if (n.isMesh && n.material && n.material.name === "Cotton_Twill_FRONT_289623") shirtMesh = n;
  });

  // Initial material & controls
  Object.assign(state, PRESETS[currentFabric]);
  fabricSel.value = currentFabric;
  colorInput.value = toHex(state.color);
  roughR.value = state.roughness; sheenR.value = state.sheen; sheenRR.value = state.sheenR;
  normalR.value = state.normalScale; weaveR.value = state.repeat;

  buildPartsUI(modelRoot);
  loaderEl.style.display = 'none';

  rebuildMaterial();

  // Smooth zoom-to-fit with a subtle orbit
  fitCameraToObject(shirtMesh || modelRoot, 1.15, 1200, true);
});

/* ---------- Render loop ---------- */
function animate() {
  requestAnimationFrame(animate);
  updateFitAnimation();
  controls.update();
  renderer.render(scene, camera);
}
animate();

/* ---------- Resize => refit ---------- */
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (shirtMesh || modelRoot) fitCameraToObject(shirtMesh || modelRoot, 1.15, 600, false);
});

/* ---------- Helpers ---------- */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function toHex(val) {
  if (typeof val === 'string' && val.startsWith('#')) return val.toLowerCase();
  const c = new THREE.Color(val); return `#${c.getHexString()}`;
}
function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const col = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * col);
  };
  return `#${((1<<24) + (f(0)<<16) + (f(8)<<8) + f(4)).toString(16).slice(1)}`;
}
