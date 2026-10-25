const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const GLTF_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
const PERSON_URL = './assets/cesium-man.glb';
const contexts = new WeakMap();
let runtimePromise;
let personPromise;

function loadRuntime() {
  if (!runtimePromise) runtimePromise = Promise.all([import(THREE_URL), import(GLTF_URL)]).then(([THREE, loaderModule]) => ({ THREE, GLTFLoader: loaderModule.GLTFLoader }));
  return runtimePromise;
}

function loadPerson(THREE, GLTFLoader) {
  if (!personPromise) personPromise = new GLTFLoader().loadAsync(PERSON_URL).then((result) => result.scene).catch(() => null);
  return personPromise;
}

function fitRenderer(renderer, camera, canvas) {
  const width = Math.max(1, canvas.clientWidth || 420);
  const height = Math.max(1, canvas.clientHeight || 180);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  if (camera.isOrthographicCamera) {
    const halfHeight = (camera.userData.baseHeight || (camera.top - camera.bottom)) / 2;
    const halfWidth = halfHeight * (width / height);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
  } else camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function makeRenderer(THREE, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse?.((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
  }
}

function clonePerson(THREE, template, scale = .2) {
  if (!template) return new THREE.Mesh(new THREE.CapsuleGeometry(.16, .42, 4, 8), new THREE.MeshStandardMaterial({ color: 0xd4521c, roughness: .8 }));
  const person = template.clone(true);
  person.scale.setScalar(scale);
  person.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false;
      object.receiveShadow = false;
      if (object.geometry?.clone) object.geometry = object.geometry.clone();
      if (Array.isArray(object.material)) object.material = object.material.map((material) => material.clone());
      else if (object.material?.clone) object.material = object.material.clone();
    }
  });
  return person;
}

function makeStylizedPerson(THREE, scale = 1, palette = {}) {
  const group = new THREE.Group();
  const boxMaterial = new THREE.MeshStandardMaterial({ color: 0xc9363e, roughness: .58, metalness: .04 });
  const fryMaterial = new THREE.MeshStandardMaterial({ color: 0xf2c84b, roughness: .55, metalness: .02 });
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0x25211f, roughness: .82 });
  const limbMaterial = new THREE.MeshStandardMaterial({ color: 0x35302c, roughness: .82 });

  // A simple inverted trapezoid: the top is wider, like a fries carton.
  const cartonShape = new THREE.Shape();
  cartonShape.moveTo(-.25, .12);
  cartonShape.lineTo(.25, .12);
  cartonShape.lineTo(.34, .56);
  cartonShape.lineTo(-.34, .56);
  cartonShape.closePath();
  const carton = new THREE.Mesh(new THREE.ExtrudeGeometry(cartonShape, { depth: .24, bevelEnabled: false }), boxMaterial);
  carton.position.z = -.12;
  group.add(carton);

  // Seven thin fries rise above the carton; the small offsets keep them legible
  // when the character is repeated around the water, track and cash scenes.
  [-.25, -.17, -.09, 0, .09, .18, .26].forEach((x, index) => {
    const fry = new THREE.Mesh(new THREE.BoxGeometry(.052, .38 + (index % 3) * .035, .09), fryMaterial);
    fry.position.set(x, .68 + (index % 2) * .015, .01);
    fry.rotation.z = (index % 2 ? -1 : 1) * (.035 + (index % 3) * .012);
    group.add(fry);
  });

  // Two horizontal eye marks sit on the carton just below the fries.
  [-.13, .13].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(.085, .025, .022), faceMaterial);
    eye.position.set(x, .42, .145);
    group.add(eye);
  });

  // A blocky M is made from four short cylinders so it remains visible at
  // small scale without loading another texture or font asset.
  const mouthPoints = [[-.19, .33], [-.095, .41], [0, .33], [.095, .41], [.19, .33]];
  for (let index = 0; index < mouthPoints.length - 1; index += 1) {
    const [x1, y1] = mouthPoints[index]; const [x2, y2] = mouthPoints[index + 1];
    const dx = x2 - x1; const dy = y2 - y1; const length = Math.hypot(dx, dy);
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, length, 6), faceMaterial);
    segment.position.set((x1 + x2) / 2, (y1 + y2) / 2, .15);
    segment.rotation.z = -Math.atan2(dx, dy);
    group.add(segment);
  }

  // Four deliberately thin limbs keep the standing silhouette readable.
  [-.36, .36].forEach((x) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .18, 6), limbMaterial);
    arm.position.set(x, .37, 0);
    arm.rotation.z = x < 0 ? -.12 : .12;
    group.add(arm);
  });
  [-.11, .11].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .18, 6), limbMaterial);
    leg.position.set(x, .035, 0);
    group.add(leg);
  });
  group.scale.setScalar(scale);
  return group;
}

function addLights(THREE, scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8c8b, 2.2));
  const key = new THREE.DirectionalLight(0xfff4d6, 2.4);
  key.position.set(-3, 4, 6);
  scene.add(key);
}

function makeOrtho(THREE) {
  const camera = new THREE.OrthographicCamera(-3.6, 3.6, 1.55, -1.55, .1, 100);
  camera.userData.baseHeight = 3.1;
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
  return camera;
}

function makeTopCamera(THREE) {
  const camera = new THREE.OrthographicCamera(-3.7, 3.7, 2.05, -2.05, .1, 100);
  camera.userData.baseHeight = 4.1;
  camera.position.set(0, 5.8, 6.8);
  camera.lookAt(0, 0, 0);
  return camera;
}

function makeBath(THREE, template, index) {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x8ed8d9, roughness: .42, metalness: .05, transparent: true, opacity: .78 });
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x3aaeb6, roughness: .12, metalness: .08, transparent: true, opacity: .68, side: THREE.DoubleSide });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x76c9ca, roughness: .3, transparent: true, opacity: .82 });
  const width = 1.38;
  const depth = .82;
  const wallHeight = .34;
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(width, .10, depth), shell);
  bottom.position.y = -.06;
  group.add(bottom);
  const longSide = new THREE.BoxGeometry(width, wallHeight, .08);
  const shortSide = new THREE.BoxGeometry(.08, wallHeight, depth - .08);
  [-depth / 2 + .04, depth / 2 - .04].forEach((z) => { const side = new THREE.Mesh(longSide, shell); side.position.set(0, wallHeight / 2, z); group.add(side); });
  [-width / 2 + .04, width / 2 - .04].forEach((x) => { const side = new THREE.Mesh(shortSide, shell); side.position.set(x, wallHeight / 2, 0); group.add(side); });
  // Four rails leave the top open so the water and the reclining person remain readable.
  const railLong = new THREE.BoxGeometry(width + .06, .045, .10);
  const railShort = new THREE.BoxGeometry(.10, .045, depth - .02);
  [-depth / 2 - .01, depth / 2 + .01].forEach((z) => { const rail = new THREE.Mesh(railLong, rimMaterial); rail.position.set(0, wallHeight + .02, z); group.add(rail); });
  [-width / 2 - .01, width / 2 + .01].forEach((x) => { const rail = new THREE.Mesh(railShort, rimMaterial); rail.position.set(x, wallHeight + .02, 0); group.add(rail); });
  const water = new THREE.Mesh(new THREE.BoxGeometry(width - .18, .035, depth - .18), waterMaterial);
  water.position.y = .23;
  group.add(water);
  const person = makeStylizedPerson(THREE, .62, { shirt: index % 2 ? 0x2b777b : 0xd4521c });
  // The person lies along the tub, while the camera looks down from above.
  person.rotation.z = -Math.PI / 2;
  person.position.set(-.08, .28, .01);
  group.add(person);
  group.userData = { index, water, person, baseY: 0 };
  return group;
}

function initWater(ctx, THREE, template) {
  const scene = new THREE.Scene();
  const camera = makeTopCamera(THREE);
  const renderer = makeRenderer(THREE, ctx.canvas);
  addLights(THREE, scene);
  const root = new THREE.Group(); scene.add(root);
  const state = { units: 0, baths: [] };
  ctx.scene = scene; ctx.camera = camera; ctx.renderer = renderer; ctx.state = state;
  ctx.update = (metrics) => {
    const units = Math.max(1, Math.ceil(metrics.waterLitres / 100));
    if (units === state.units) return;
    state.units = units; clearGroup(root); state.baths = [];
    const visible = Math.min(units, 12);
    for (let i = 0; i < visible; i += 1) {
      const bath = makeBath(THREE, template, i);
      const col = i % 4; const row = Math.floor(i / 4);
      bath.position.set((col - 1.5) * 1.62, 0, (1 - row) * .98 - .18);
      bath.scale.setScalar(.92); bath.userData.baseY = bath.position.y;
      state.baths.push(bath); root.add(bath);
    }
  };
  return ctx;
}

function stadiumShape(THREE, straight, radius, inner = null) {
  const shape = new THREE.Shape();
  shape.moveTo(-straight, radius);
  shape.lineTo(straight, radius);
  shape.absarc(straight, 0, radius, Math.PI / 2, -Math.PI / 2, true);
  shape.lineTo(-straight, -radius);
  shape.absarc(-straight, 0, radius, -Math.PI / 2, Math.PI / 2, true);
  shape.closePath();
  if (inner) {
    const hole = new THREE.Path();
    hole.moveTo(-straight, inner);
    hole.lineTo(straight, inner);
    hole.absarc(straight, 0, inner, Math.PI / 2, -Math.PI / 2, true);
    hole.lineTo(-straight, -inner);
    hole.absarc(-straight, 0, inner, -Math.PI / 2, Math.PI / 2, true);
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}

function stadiumPosition(THREE, progress, straight = 1.25, radius = 1.18) {
  const total = 4 * straight + 2 * Math.PI * radius;
  let distance = ((progress % 1) + 1) % 1 * total;
  if (distance < 2 * straight) return new THREE.Vector3(straight - distance, .18, radius);
  distance -= 2 * straight;
  if (distance < Math.PI * radius) {
    const angle = Math.PI / 2 + distance / radius;
    return new THREE.Vector3(-straight + radius * Math.cos(angle), .18, radius * Math.sin(angle));
  }
  distance -= Math.PI * radius;
  if (distance < 2 * straight) return new THREE.Vector3(-straight + distance, .18, -radius);
  distance -= 2 * straight;
  const angle = -Math.PI / 2 + distance / radius;
  return new THREE.Vector3(straight + radius * Math.cos(angle), .18, radius * Math.sin(angle));
}

function initLand(ctx, THREE, template) {
  const scene = new THREE.Scene(); const camera = makeTopCamera(THREE); const renderer = makeRenderer(THREE, ctx.canvas);
  addLights(THREE, scene);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 4.0), new THREE.MeshStandardMaterial({ color: 0xe9e0d1, roughness: 1, side: THREE.DoubleSide }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.08; scene.add(ground);
  const trackShape = stadiumShape(THREE, 1.25, 1.18, .82);
  const track = new THREE.Mesh(new THREE.ShapeGeometry(trackShape), new THREE.MeshStandardMaterial({ color: 0xd4521c, roughness: .72, side: THREE.DoubleSide }));
  track.rotation.x = -Math.PI / 2; track.position.y = .02; scene.add(track);
  const inner = new THREE.Mesh(new THREE.ShapeGeometry(stadiumShape(THREE, 1.25, .80)), new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 1, side: THREE.DoubleSide }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = .04; scene.add(inner);
  const reference = makeStylizedPerson(THREE, .68, { shirt: 0xd4521c }); reference.position.set(-3.0, .12, -1.42); scene.add(reference);
  const runners = [];
  for (let i = 0; i < 3; i += 1) { const runner = makeStylizedPerson(THREE, .42, { shirt: 0x6a9a87 }); scene.add(runner); runners.push(runner); }
  ctx.scene = scene; ctx.camera = camera; ctx.renderer = renderer; ctx.state = { runners, land: 0 };
  ctx.update = (metrics) => { ctx.state.land = metrics.landM2Year; };
  return ctx;
}

function initLabor(ctx, THREE, template) {
  const scene = new THREE.Scene(); const camera = makeOrtho(THREE); const renderer = makeRenderer(THREE, ctx.canvas);
  addLights(THREE, scene);
  const routePoints = [new THREE.Vector3(-3.1, -.6, 0), new THREE.Vector3(-1.8, .35, 0), new THREE.Vector3(-.4, -.25, 0), new THREE.Vector3(1.1, .4, 0), new THREE.Vector3(3.1, -.38, 0)];
  const curve = new THREE.CatmullRomCurve3(routePoints);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, .035, 6, false), new THREE.MeshStandardMaterial({ color: 0xd2b07a, roughness: .7 })));
  const stageColors = [0x6a9a87, 0xa78665, 0x8db5b1, 0xd4521c, 0xd2b07a];
  routePoints.forEach((point, index) => { const node = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .05, 24), new THREE.MeshStandardMaterial({ color: stageColors[index] })); node.position.copy(point); node.position.z = .1; node.rotation.x = Math.PI / 2; scene.add(node); });
  const people = []; for (let i = 0; i < 5; i += 1) { const person = makeStylizedPerson(THREE, .52, { shirt: stageColors[i] }); scene.add(person); people.push(person); }
  ctx.scene = scene; ctx.camera = camera; ctx.renderer = renderer; ctx.state = { people, curve, chain: [] };
  ctx.update = (metrics) => { ctx.state.chain = metrics.laborChain || []; };
  return ctx;
}

function makeBill(THREE, x, y, z, tilt) {
  const group = new THREE.Group();
  const bill = new THREE.Mesh(new THREE.BoxGeometry(1.25, .055, .58), new THREE.MeshStandardMaterial({ color: 0xb9282f, roughness: .5 }));
  bill.position.set(x, y, z); bill.rotation.z = tilt; group.add(bill);
  const seal = new THREE.Mesh(new THREE.BoxGeometry(.12, .012, .34), new THREE.MeshStandardMaterial({ color: 0xf2c84b, roughness: .4 }));
  seal.position.set(x, y + .035, z); seal.rotation.z = tilt; group.add(seal);
  group.userData.baseY = y;
  return group;
}

function initMoney(ctx, THREE, template) {
  const scene = new THREE.Scene(); const camera = makeOrtho(THREE); const renderer = makeRenderer(THREE, ctx.canvas);
  addLights(THREE, scene);
  const reference = makeStylizedPerson(THREE, .72, { shirt: 0xd4521c }); reference.position.set(-2.35, -.72, .2); scene.add(reference);
  const root = new THREE.Group(); scene.add(root);
  ctx.scene = scene; ctx.camera = camera; ctx.renderer = renderer; ctx.state = { root, bundles: 0, cost: 0 };
  ctx.update = (metrics) => {
    const bundles = Math.max(1, Math.ceil(metrics.costRmb / 1000));
    if (bundles === ctx.state.bundles && metrics.costRmb === ctx.state.cost) return;
    ctx.state.bundles = bundles; ctx.state.cost = metrics.costRmb; clearGroup(root);
    const visible = Math.min(bundles, 6);
    for (let b = 0; b < visible; b += 1) for (let note = 0; note < 10; note += 1) root.add(makeBill(THREE, .4 + b * .34, -.65 + note * .06 + b * .08, 0, ((note + b) % 3 - 1) * .02));
  };
  return ctx;
}

function animate(ctx, THREE, start) {
  const elapsed = (performance.now() - start) / 1000;
  if (ctx.renderer && ctx.scene && ctx.camera) {
    fitRenderer(ctx.renderer, ctx.camera, ctx.canvas);
    if (ctx.type === 'water') ctx.state.baths.forEach((bath, index) => { bath.position.y = bath.userData.baseY + Math.sin(elapsed * 1.8 + index) * .025; bath.userData.water.scale.x = 1 + Math.sin(elapsed * 2.2 + index) * .025; bath.userData.person.rotation.y = Math.sin(elapsed * 1.5 + index) * .04; });
    if (ctx.type === 'land') ctx.state.runners.forEach((runner, index) => {
      const progress = (elapsed * .055 + index / 3) % 1;
      const point = stadiumPosition(THREE, progress);
      const next = stadiumPosition(THREE, progress + .002);
      runner.position.copy(point);
      runner.rotation.set(0, Math.atan2(next.x - point.x, next.z - point.z), 0);
    });
    if (ctx.type === 'labor') ctx.state.people.forEach((person, index) => { const progress = (elapsed * .055 + index / 5) % 1; const point = ctx.state.curve.getPointAt(progress); const next = ctx.state.curve.getPointAt((progress + .01) % 1); person.position.copy(point); person.position.z = .22; person.rotation.set(0, Math.atan2(next.x - point.x, next.y - point.y), 0); });
    if (ctx.type === 'money') ctx.state.root.children.forEach((bill, index) => { bill.position.y = bill.userData.baseY + Math.sin(elapsed * 2.2 + index * .13) * .012; });
    ctx.renderer.render(ctx.scene, ctx.camera);
  }
  requestAnimationFrame(() => animate(ctx, THREE, start));
}

function initContext(ctx, runtime, template) {
  const { THREE } = runtime;
  if (ctx.type === 'water') initWater(ctx, THREE, template);
  if (ctx.type === 'land') initLand(ctx, THREE, template);
  if (ctx.type === 'labor') initLabor(ctx, THREE, template);
  if (ctx.type === 'money') initMoney(ctx, THREE, template);
  ctx.canvas.parentElement?.classList.add('has-3d');
  ctx.ready = true; ctx.update(ctx.metrics || {});
  requestAnimationFrame(() => animate(ctx, THREE, performance.now()));
}

export function mountPhysicalScenes(canvases, metrics) {
  loadRuntime().then((runtime) => loadPerson(runtime.THREE, runtime.GLTFLoader).then((template) => {
    Object.entries(canvases).forEach(([type, canvas]) => {
      if (!canvas) return;
      let ctx = contexts.get(canvas);
      if (!ctx) { ctx = { canvas, type, ready: false, metrics }; contexts.set(canvas, ctx); initContext(ctx, runtime, template); }
      ctx.metrics = metrics; ctx.update?.(metrics);
    });
  })).catch(() => { /* CSS fallback remains visible when WebGL or the public model is unavailable. */ });
}
