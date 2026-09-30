import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

window.addEventListener('error', (event) => {
  console.error(event.error || event.message);
});
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8bcff2);
scene.fog = new THREE.Fog(0x8bcff2, 90, 260);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 5, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xbfeaff, 0x5c774d, 2.2);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff4cf, 3);
sun.position.set(70, 110, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const controls = new PointerLockControls(camera, document.body);
const startScreen = document.getElementById('start-screen');
document.getElementById('start').addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => startScreen.style.display = 'none');
controls.addEventListener('unlock', () => startScreen.style.display = 'grid');

const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);

const CHUNK = 40;
const RADIUS = 3;
const chunks = new Map();
const worldSeed = 73921;

function hash(x, z) {
  let n = Math.sin(x * 127.1 + z * 311.7 + worldSeed) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x, z) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0), b = hash(x0 + 1, z0);
  const c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a,b,sx), THREE.MathUtils.lerp(c,d,sx), sz);
}
function terrainHeight(x, z) {
  const n1 = smoothNoise(x / 32, z / 32);
  const n2 = smoothNoise(x / 13, z / 13);
  const n3 = smoothNoise(x / 70, z / 70);
  return (n1 * 10 + n2 * 3 + n3 * 18) - 12;
}

const matGrass = new THREE.MeshStandardMaterial({ color: 0x5d8c4d, roughness: 1 });
const matDirt = new THREE.MeshStandardMaterial({ color: 0x876b4d, roughness: 1 });
const matStone = new THREE.MeshStandardMaterial({ color: 0x777b78, roughness: 1 });
const matTrunk = new THREE.MeshStandardMaterial({ color: 0x65462f, roughness: 1 });
const matLeaves = new THREE.MeshStandardMaterial({ color: 0x2e6d42, roughness: 1 });
const matWater = new THREE.MeshStandardMaterial({ color: 0x3f9dcc, transparent: true, opacity: .7, roughness: .1 });

function addTree(group, x, y, z, scale) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.35*scale, .48*scale, 3*scale, 7), matTrunk);
  trunk.position.set(x, y + 1.5*scale, z);
  trunk.castShadow = true;
  group.add(trunk);

  const crown = new THREE.Mesh(new THREE.ConeGeometry(2.1*scale, 4.8*scale, 7), matLeaves);
  crown.position.set(x, y + 4.2*scale, z);
  crown.castShadow = true;
  group.add(crown);
}

function addRock(group, x, y, z, scale) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), matStone);
  rock.position.set(x, y + scale*.45, z);
  rock.rotation.set(hash(x,z)*2, hash(z,x)*2, hash(x+3,z+4)*2);
  rock.castShadow = true;
  group.add(rock);
}

function createChunk(cx, cz) {
  const key = `${cx},${cz}`;
  if (chunks.has(key)) return;

  const group = new THREE.Group();
  group.userData.key = key;

  const seg = 20;
  const size = CHUNK;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i) + cx * CHUNK;
    const lz = pos.getZ(i) + cz * CHUNK;
    pos.setY(i, terrainHeight(lx, lz));
  }
  geo.computeVertexNormals();

  const terrain = new THREE.Mesh(geo, matGrass);
  terrain.position.set(cx * CHUNK, 0, cz * CHUNK);
  terrain.receiveShadow = true;
  group.add(terrain);

  // Scatter vegetation deterministically.
  for (let i = 0; i < 28; i++) {
    const lx = (hash(cx*71+i, cz*113+i) - .5) * CHUNK;
    const lz = (hash(cx*173+i, cz*37+i) - .5) * CHUNK;
    const wx = cx * CHUNK + lx, wz = cz * CHUNK + lz;
    const y = terrainHeight(wx, wz);
    const r = hash(cx*19+i, cz*23+i);
    if (y > -2 && r > .34) addTree(group, lx, y, lz, .65 + r * .7);
    else if (r < .13 && y > -8) addRock(group, lx, y, lz, .4 + r * 1.8);
  }

  // Occasional simple ruin/structure.
  const structureChance = hash(cx * 991, cz * 997);
  if (structureChance > .965) {
    const x = (hash(cx+55, cz+21)-.5)*12;
    const z = (hash(cx+17, cz+88)-.5)*12;
    const y = terrainHeight(cx*CHUNK+x, cz*CHUNK+z);
    for (let i=0;i<5;i++) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4+i%2, 1.5), matStone);
      pillar.position.set(x + (i-2)*3, y + 2, z + ((i%2)*3-1.5));
      pillar.castShadow = true;
      group.add(pillar);
    }
  }

  // Water plane in lower terrain areas, subtly broken into chunks.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, CHUNK), matWater);
  water.rotation.x = -Math.PI/2;
  water.position.set(cx*CHUNK, -5.2, cz*CHUNK);
  group.add(water);

  scene.add(group);
  chunks.set(key, group);
}

function updateChunks() {
  const cx = Math.floor(camera.position.x / CHUNK);
  const cz = Math.floor(camera.position.z / CHUNK);

  for (let x = cx - RADIUS; x <= cx + RADIUS; x++) {
    for (let z = cz - RADIUS; z <= cz + RADIUS; z++) createChunk(x, z);
  }

  for (const [key, group] of chunks) {
    const [x,z] = key.split(',').map(Number);
    if (Math.abs(x-cx) > RADIUS || Math.abs(z-cz) > RADIUS) {
      scene.remove(group);
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
      });
      chunks.delete(key);
    }
  }
}

const clock = new THREE.Clock();
const velocity = new THREE.Vector3();
let lastChunkX = 999999, lastChunkZ = 999999;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);

  if (controls.isLocked) {
    const sprint = keys.ShiftLeft || keys.ShiftRight;
    const speed = sprint ? 22 : 11;
    const dir = new THREE.Vector3(
      (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
      0,
      (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0)
    );
    if (dir.lengthSq()) dir.normalize();
    controls.moveRight(dir.x * speed * dt);
    controls.moveForward(-dir.z * speed * dt);

    // Keep the player approximately on the terrain.
    const ground = terrainHeight(camera.position.x, camera.position.z);
    camera.position.y += (ground + 3.2 - camera.position.y) * Math.min(1, dt * 8);

    const cx = Math.floor(camera.position.x / CHUNK);
    const cz = Math.floor(camera.position.z / CHUNK);
    if (cx !== lastChunkX || cz !== lastChunkZ) {
      lastChunkX = cx; lastChunkZ = cz; updateChunks();
    }
  }

  document.getElementById('coords').textContent =
    `X: ${Math.round(camera.position.x)} · Z: ${Math.round(camera.position.z)}`;

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

updateChunks();
animate();
