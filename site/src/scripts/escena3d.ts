import {
  ACESFilmicToneMapping, AmbientLight, BufferGeometry, CylinderGeometry,
  DirectionalLight, DoubleSide, Group, HemisphereLight, InstancedMesh,
  LatheGeometry, MathUtils, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  Object3D, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Scene,
  ShadowMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';

// A conceptual California presentation, not a portion or recipe photograph.
const RICE_RADIUS = 1.3;
const ROLL_LENGTH = 2.15;
const PLATE_SURFACE = .48;
const COLOR = { arroz: 0xfff5e2, nori: 0x243326, palta: 0x93ae48, ebi: 0xdca052, madera: 0xac7e51 };

export interface EscenaOpciones { cheap?: boolean }
export interface EscenaApi {
  mirar(x: number, y: number): void;
  progreso(p: number): void;
  setLoop(active: boolean): void;
  capturar(px?: number, calidad?: number): string | null;
  destruir(): void;
  stats(): { cuadros: number; triangulos: number; geometrias: number };
}

export function montarEscena(canvas: HTMLCanvasElement, options: EscenaOpciones = {}): EscenaApi | null {
  try { if (!canvas.getContext('webgl2')) return null; } catch { return null; }
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); }
  catch { return null; }
  const pixelRatio = Math.min(devicePixelRatio || 1, options.cheap ? 1 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new Scene();
  const camera = new PerspectiveCamera(37, 1, .1, 100);
  const target = new Vector3(.25, 1.15, 0);
  const light = new DirectionalLight(0xffefd7, 3.1);
  light.position.set(-9, 19, 13);
  light.castShadow = true;
  light.shadow.mapSize.set(options.cheap ? 512 : 1024, options.cheap ? 512 : 1024);
  Object.assign(light.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 65 });
  light.shadow.normalBias = .035;
  light.shadow.bias = -.0002;
  scene.add(light, new HemisphereLight(0xfff8ee, 0x526381, 1.3), new AmbientLight(0xffffff, .3));
  const ground = new Mesh(new PlaneGeometry(100, 100), new ShadowMaterial({ opacity: .19 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // A flat interior keeps every roll above the plate, with a shallow raised rim.
  const profile = [[0, .12], [5.3, .12], [6.0, .25], [6.3, .55], [6.25, .7], [6.0, .75], [5.4, PLATE_SURFACE], [0, PLATE_SURFACE]];
  const plate = new Mesh(
    new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 64),
    new MeshPhysicalMaterial({ color: 0x202a3b, roughness: .62, clearcoat: .18, side: DoubleSide }),
  );
  plate.castShadow = true;
  plate.receiveShadow = true;
  scene.add(plate);
  const rim = new Mesh(new TorusGeometry(6, .045, 6, 64), new MeshStandardMaterial({ color: 0x9e7d58, roughness: .65 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = .76;
  scene.add(rim);

  const riceMaterial = new MeshStandardMaterial({ color: COLOR.arroz, roughness: .68 });
  const noriMaterial = new MeshStandardMaterial({ color: COLOR.nori, roughness: .88 });
  const avocadoMaterial = new MeshStandardMaterial({ color: COLOR.palta, roughness: .58 });
  const shrimpMaterial = new MeshStandardMaterial({ color: COLOR.ebi, roughness: .84 });
  const shrimpCoreMaterial = new MeshStandardMaterial({ color: 0xffe1b9, roughness: .6 });
  const seedMaterial = new MeshStandardMaterial({ color: 0xc49a63, roughness: .8 });
  const grainGeometry = new SphereGeometry(1, 6, 4);
  const grainTransform = new Object3D();
  let seed = 7461;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const addMesh = (parent: Group, geometry: BufferGeometry, material: MeshStandardMaterial, position: [number, number, number], scale?: [number, number, number]) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const roll = () => {
    const group = new Group();
    addMesh(group, new CylinderGeometry(RICE_RADIUS, RICE_RADIUS, ROLL_LENGTH, 40), riceMaterial, [0, 0, 0]);
    for (const side of [-1, 1]) {
      const face = side * (ROLL_LENGTH / 2 + .025);
      const ring = addMesh(group, new TorusGeometry(.82, .055, 8, 32), noriMaterial, [0, face, 0]);
      ring.rotation.x = Math.PI / 2;
      addMesh(group, new SphereGeometry(1, 16, 10), shrimpMaterial, [-.24, face, .06], [.44, .11, .62]);
      addMesh(group, new SphereGeometry(1, 12, 8), shrimpCoreMaterial, [-.25, face + side * .1, .02], [.27, .07, .4]);
      const avocado = addMesh(group, new SphereGeometry(1, 16, 10), avocadoMaterial, [.34, face, -.08], [.28, .1, .62]);
      avocado.rotation.y = -.25;
    }
    // Instanced grains add texture with two draw calls per roll, not hundreds of meshes.
    const count = options.cheap ? 190 : 330;
    const grains = new InstancedMesh(grainGeometry, riceMaterial, count);
    const sesame = new InstancedMesh(grainGeometry, seedMaterial, 85);
    for (let i = 0; i < count + 85; i++) {
      const angle = random() * Math.PI * 2;
      const isFace = i < count && i % 3 === 0;
      const radius = isFace ? Math.sqrt(.88 ** 2 + random() * (RICE_RADIUS ** 2 - .88 ** 2)) : RICE_RADIUS + .015;
      const y = isFace ? (i % 2 ? -1 : 1) * (ROLL_LENGTH / 2 + .025) : (random() - .5) * ROLL_LENGTH;
      grainTransform.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      grainTransform.rotation.set(random() * 3, angle, random() * 3);
      const size = i < count ? .085 : .057;
      grainTransform.scale.set(size, size * .48, size * .65);
      if (i >= count) grainTransform.position.multiplyScalar(1.025);
      grainTransform.updateMatrix();
      (i < count ? grains : sesame).setMatrixAt(i < count ? i : i - count, grainTransform.matrix);
    }
    grains.castShadow = true;
    grains.receiveShadow = true;
    sesame.castShadow = true;
    group.add(grains, sesame);
    return group;
  };
  const food = new Group();
  for (const [x, z, turn] of [[-2.8, 1.35, -.25], [.1, 1.8, .1], [3, 1.1, .28], [-2.7, -1.6, -.2], [.25, -1.65, .12], [2.9, -1.8, .3]]) {
    const piece = roll();
    piece.position.set(x, PLATE_SURFACE + RICE_RADIUS + .065, z);
    piece.rotation.set(Math.PI / 2, turn, 0);
    food.add(piece);
  }
  scene.add(food);
  const wood = new MeshStandardMaterial({ color: COLOR.madera, roughness: .72 });
  for (const x of [6.65, 7.05]) {
    const stick = new Mesh(new CylinderGeometry(.07, .14, 10.8, 10), wood);
    stick.rotation.set(Math.PI / 2, 0, -.05);
    stick.position.set(x, .145, -.65);
    stick.castShadow = true;
    scene.add(stick);
  }

  const desired = { x: 0, y: 0 };
  const actual = { x: 0, y: 0 };
  let entry = 1;
  let frames = 0;
  let enabled = true;
  let disposed = false;
  let pending = 0;
  const request = () => { if (!pending && enabled && !disposed) pending = requestAnimationFrame(draw); };
  function draw() {
    pending = 0;
    if (!enabled || disposed) return;
    actual.x += (desired.x - actual.x) * .1;
    actual.y += (desired.y - actual.y) * .1;
    const angle = MathUtils.degToRad(actual.x);
    camera.position.set(Math.sin(angle) * 22.8, 14 + actual.y * .2, Math.cos(angle) * 22.8);
    camera.lookAt(target);
    food.position.y = (1 - entry) ** 3 * .8;
    renderer.render(scene, camera);
    frames++;
    if (Math.abs(desired.x - actual.x) + Math.abs(desired.y - actual.y) > .002) request();
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
    request();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  return {
    mirar(x, y) { desired.x = MathUtils.clamp(x, -5, 5); desired.y = MathUtils.clamp(y, -5, 5); request(); },
    progreso(value) { entry = MathUtils.clamp(value, 0, 1); request(); },
    setLoop(value) { enabled = value; if (!value && pending) { cancelAnimationFrame(pending); pending = 0; } if (value) request(); },
    capturar(px = 1200, quality = .9) {
      if (disposed) return null;
      const rect = canvas.getBoundingClientRect();
      renderer.setPixelRatio(1);
      renderer.setSize(px, px, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const url = canvas.toDataURL('image/webp', quality);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
      request();
      return url;
    },
    destruir() {
      disposed = true;
      cancelAnimationFrame(pending);
      observer.disconnect();
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<MeshStandardMaterial>();
      scene.traverse(object => {
        if (object instanceof Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material as MeshStandardMaterial);
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      renderer.dispose();
    },
    stats() { return { cuadros: frames, triangulos: renderer.info.render.triangles, geometrias: renderer.info.memory.geometries }; },
  };
}

export { COLOR as COLOR_ESCENA };
