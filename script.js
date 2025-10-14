import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- UI Elements & Data ---
const loaderElement = document.getElementById('loader');
const panel = document.getElementById('customizer-panel');
const customizeBtn = document.getElementById('customize-btn');
const partsContainer = document.getElementById('parts-container');
const palettesContainer = document.getElementById('palettes-container');

const presetColors = ['#ffffff', '#222222', '#B5A691', '#883939', '#3b5998', '#5D76A9', '#F2E5D7', '#8E625A', '#A1A1A1', '#4F4F4F'];
const materialNameMap = { "Cotton_Twill_FRONT_289623": "Shirt", "Material15575": "Buttons", "Material15577": "Thread", "Material15595": "Cuffs", "Material15597": "Cuffs Thread" };

// --- Scene, Camera, Renderer, Lighting ---
const canvas = document.querySelector('#c');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9eef2);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(-5, 10, 10);
scene.add(directionalLight);

// --- MODEL LOADING & UI CREATION ---
const loader = new GLTFLoader();
loader.load("Men's Shirt.glb", (gltf) => {
    const model = gltf.scene;
    
    // Smart Zoom
    let shirtMesh;
    model.traverse((node) => { if (node.isMesh && node.material && node.material.name === "Cotton_Twill_FRONT_289623") { shirtMesh = node; } });
    const objectToFit = shirtMesh || model;
    const box = new THREE.Box3().setFromObject(objectToFit);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 0.8;
    camera.position.set(center.x, center.y, center.z + cameraZ);
    controls.target.copy(center);
    controls.update();
    
    loaderElement.style.display = 'none';
    customizeBtn.style.display = 'block';

    const materialsToDisplay = [];
    model.traverse((node) => { if (node.isMesh && node.material && materialNameMap[node.material.name]) { if (!materialsToDisplay.some(m => m.name === node.material.name)) { materialsToDisplay.push(node.material); } } });
    materialsToDisplay.sort((a, b) => { const order = Object.keys(materialNameMap); return order.indexOf(a.name) - order.indexOf(b.name); });

    // Create the new UI
    materialsToDisplay.forEach((material, index) => {
        const materialID = material.name;
        
        // Create a button for each part
        const partButton = document.createElement('button');
        partButton.className = 'part-button';
        partButton.innerText = materialNameMap[materialID];
        partButton.dataset.materialId = materialID;
        partsContainer.appendChild(partButton);

        // Create a color palette for each part
        const palette = document.createElement('div');
        palette.className = 'color-palette';
        palette.dataset.materialId = materialID;
        palettesContainer.appendChild(palette);

        presetColors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.addEventListener('click', () => {
                material.color.set(color);
                const siblings = swatch.parentElement.children;
                for (let sibling of siblings) { sibling.classList.remove('active'); }
                swatch.classList.add('active');
            });
            palette.appendChild(swatch);
        });
        
        if (palette.children[0]) { palette.children[0].classList.add('active'); }

        // Logic for showing/hiding palettes
        partButton.addEventListener('click', () => {
            // Update active button
            document.querySelectorAll('.part-button').forEach(btn => btn.classList.remove('active'));
            partButton.classList.add('active');
            // Update active palette
            document.querySelectorAll('.color-palette').forEach(p => p.classList.remove('active'));
            palette.classList.add('active');
        });

        // Activate the first part by default
        if (index === 0) {
            partButton.classList.add('active');
            palette.classList.add('active');
        }
    });

    scene.add(model);
});

// --- Controls & Animation Loop ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// Toggle panel and auto-rotation
customizeBtn.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('panel-open');
    controls.autoRotate = !isOpen; // Pause rotation when panel is open
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});