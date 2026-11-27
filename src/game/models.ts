import * as THREE from 'three';
import type { ProceduralTextureSet } from './textures';
import type { AnomalyKind } from './types';

export interface BatteryActor {
  id: number;
  group: THREE.Group;
  spinGroup: THREE.Group;
  collected: boolean;
  x: number;
  z: number;
}

export interface AnomalyActor {
  id: number;
  kind: AnomalyKind;
  group: THREE.Group;
  hitbox: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
  coreParts: THREE.Object3D[];
  baseX: number;
  baseY: number;
  baseZ: number;
  defeated: boolean;
  dissolveProgress: number; // 0..1 for Sombra / look-exposure
  alertPlayed: boolean;
  creepSpeed: number;
  mountSide: 'floor' | 'left' | 'right' | 'ceiling';
  hitsRemaining?: number;
  maxHits?: number;
}

export function createBatteryModel(
  id: number,
  x: number,
  z: number,
  textures: ProceduralTextureSet,
): BatteryActor {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Ground glow pool
  const glowMat = new THREE.MeshBasicMaterial({
    map: textures.glowMap,
    color: 0x10f5c8,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const glowDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), glowMat);
  glowDisc.rotation.x = -Math.PI / 2;
  glowDisc.position.y = 0.018;
  group.add(glowDisc);

  const spinGroup = new THREE.Group();
  spinGroup.position.y = 0.42;
  group.add(spinGroup);

  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x1f2429,
    metalness: 0.85,
    roughness: 0.28,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: textures.hazardMap,
    roughness: 0.72,
    metalness: 0.15,
  });
  const energyMat = new THREE.MeshStandardMaterial({
    color: 0x22ffd2,
    emissive: 0x0ee8b8,
    emissiveIntensity: 1.65,
    roughness: 0.18,
    metalness: 0.1,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xe3a832,
    metalness: 0.9,
    roughness: 0.22,
  });

  // 1. Bottom cap
  const baseCap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.09, 14), darkMetal);
  baseCap.position.y = -0.22;
  spinGroup.add(baseCap);

  // 2. Glowing energy core
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.36, 14), energyMat);
  spinGroup.add(core);

  // 3. Protective hazard collar ring
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.08, 14), hazardMat);
  collar.position.y = 0.12;
  spinGroup.add(collar);

  // 4. Top metallic cap
  const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.07, 14), darkMetal);
  topCap.position.y = 0.2;
  spinGroup.add(topCap);

  // 5. Positive terminal stud
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.055, 12), brassMat);
  stud.position.y = 0.26;
  spinGroup.add(stud);

  // 6. Side protective struts
  for (let s = 0; s < 3; s++) {
    const ang = (s / 3) * Math.PI * 2;
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.36, 0.025), darkMetal);
    strut.position.set(Math.cos(ang) * 0.145, 0, Math.sin(ang) * 0.145);
    spinGroup.add(strut);
  }

  return { id, group, spinGroup, collected: false, x, z };
}

export function createSombraModel(
  id: number,
  x: number,
  z: number,
  textures: ProceduralTextureSet,
): AnomalyActor {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const shadowMat = new THREE.MeshStandardMaterial({
    color: 0x0c0913,
    emissive: 0x1e0b2e,
    emissiveIntensity: 0.4,
    roughness: 0.92,
    metalness: 0.06,
    transparent: true,
    opacity: 0.96,
  });
  const wispMat = new THREE.MeshStandardMaterial({
    color: 0x171024,
    emissive: 0x3b135c,
    emissiveIntensity: 0.55,
    roughness: 0.88,
    metalness: 0.05,
    transparent: true,
    opacity: 0.72,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xe6d6ff,
    emissive: 0xc084fc,
    emissiveIntensity: 2.2,
    roughness: 0.1,
    transparent: true,
    opacity: 0.98,
  });

  // Ground contact shadow pool
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({
      map: textures.glowMap,
      color: 0x050208,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.015;
  group.add(pool);

  // 1. Lower tattered shroud
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.15, 10, 1, true), wispMat);
  skirt.position.y = 0.58;
  group.add(skirt);

  // 2. Gaunt torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.14, 0.95, 10), shadowMat);
  torso.position.y = 1.32;
  group.add(torso);

  // 3. Hunched shoulder ridge
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.2, 0.28), shadowMat);
  shoulders.position.y = 1.72;
  group.add(shoulders);

  // 4. Tilted elongated head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.02, 0.05);
  headGroup.rotation.z = 0.14;
  group.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), shadowMat);
  head.scale.set(0.85, 1.28, 0.9);
  headGroup.add(head);

  // 5-6. Pinprick pale-violet eyes
  const eyeGeo = new THREE.SphereGeometry(0.028, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.065, 0.03, 0.145);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.065, 0.03, 0.145);
  headGroup.add(eyeL, eyeR);

  // 7-8. Elongated clawed arms
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.025, 1.05, 8), shadowMat);
  leftArm.position.set(-0.4, 1.24, 0.1);
  leftArm.rotation.z = 0.18;
  leftArm.rotation.x = -0.22;
  const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.025, 1.05, 8), shadowMat);
  rightArm.position.set(0.4, 1.24, 0.1);
  rightArm.rotation.z = -0.18;
  rightArm.rotation.x = -0.22;
  group.add(leftArm, rightArm);

  // 9. Orbiting shadow horns / wisps
  const wispRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 8, 18), wispMat);
  wispRing.position.y = 0.95;
  wispRing.rotation.x = Math.PI / 2.4;
  group.add(wispRing);

  // Generous invisible hitbox on layer 1
  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 2.35, 0.9),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = 1.2;
  hitbox.layers.set(1);
  hitbox.userData.anomalyId = id;
  group.add(hitbox);

  return {
    id,
    kind: 'sombra',
    group,
    hitbox,
    materials: [shadowMat, wispMat, eyeMat],
    coreParts: [headGroup, leftArm, rightArm, wispRing],
    baseX: x,
    baseY: 0,
    baseZ: z,
    defeated: false,
    dissolveProgress: 0,
    alertPlayed: false,
    creepSpeed: 0,
    mountSide: 'floor',
  };
}

export function createOjoModel(
  id: number,
  mountSide: 'left' | 'right' | 'ceiling',
  z: number,
  textures: ProceduralTextureSet,
  corridorHalfWidth: number,
  ceilingHeight: number,
  offsetCoord?: number,
): AnomalyActor {
  const group = new THREE.Group();
  let bx = 0;
  let by = 2.0;

  if (mountSide === 'left') {
    bx = -corridorHalfWidth + 0.08;
    by = offsetCoord ?? (1.65 + Math.random() * 0.85);
    group.position.set(bx, by, z);
    group.rotation.y = Math.PI / 2.5;
  } else if (mountSide === 'right') {
    bx = corridorHalfWidth - 0.08;
    by = offsetCoord ?? (1.65 + Math.random() * 0.85);
    group.position.set(bx, by, z);
    group.rotation.y = -Math.PI / 2.5;
  } else {
    bx = offsetCoord ?? (Math.random() - 0.5) * 2.6;
    by = ceilingHeight - 0.12;
    group.position.set(bx, by, z);
    group.rotation.x = Math.PI / 3.2;
  }

  const socketMat = new THREE.MeshStandardMaterial({
    color: 0x1b1417,
    metalness: 0.65,
    roughness: 0.42,
  });
  const tendrilMat = new THREE.MeshStandardMaterial({
    color: 0x3b0b12,
    emissive: 0x220408,
    emissiveIntensity: 0.5,
    roughness: 0.55,
    metalness: 0.25,
  });
  const eyeballMat = new THREE.MeshPhysicalMaterial({
    map: textures.irisMap,
    emissive: 0x5c0a0f,
    emissiveIntensity: 1.05,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const rimGlowMat = new THREE.MeshStandardMaterial({
    color: 0xff2b3d,
    emissive: 0xff1e33,
    emissiveIntensity: 1.75,
    roughness: 0.3,
  });

  // 1. Industrial fleshy socket ring
  const socket = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.085, 10, 20), socketMat);
  group.add(socket);

  // 2. Back plate
  const backPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.12, 16), socketMat);
  backPlate.rotation.x = Math.PI / 2;
  backPlate.position.z = -0.08;
  group.add(backPlate);

  // 3. Eyeball core (oriented so +Z looks toward player)
  const eyePivot = new THREE.Group();
  group.add(eyePivot);

  const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 18), eyeballMat);
  // Rotate sphere so canvas center faces +Z
  eyeball.rotation.y = -Math.PI / 2;
  eyePivot.add(eyeball);

  // 4. Inner crimson target ring
  const targetRing = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.018, 8, 24), rimGlowMat);
  targetRing.position.z = 0.06;
  group.add(targetRing);

  // 5-8. Radiating anchor tendrils
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const tendril = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.52, 7), tendrilMat);
    tendril.position.set(Math.cos(ang) * 0.45, Math.sin(ang) * 0.45, -0.05);
    tendril.rotation.z = ang - Math.PI / 2;
    group.add(tendril);
  }

  // Generous invisible hitbox on layer 1
  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 10, 10),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.layers.set(1);
  hitbox.userData.anomalyId = id;
  group.add(hitbox);

  return {
    id,
    kind: 'ojo',
    group,
    hitbox,
    materials: [socketMat, tendrilMat, rimGlowMat],
    coreParts: [eyePivot, targetRing],
    baseX: bx,
    baseY: by,
    baseZ: z,
    defeated: false,
    dissolveProgress: 0,
    alertPlayed: false,
    creepSpeed: 0,
    mountSide,
  };
}

export function createFiguraModel(
  id: number,
  x: number,
  z: number,
  textures: ProceduralTextureSet,
): AnomalyActor {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const suitMat = new THREE.MeshStandardMaterial({
    color: 0x4b1322,
    roughness: 0.78,
    metalness: 0.08,
  });
  const limbMat = new THREE.MeshStandardMaterial({
    color: 0x17181d,
    roughness: 0.52,
    metalness: 0.35,
  });
  const maskMat = new THREE.MeshStandardMaterial({
    map: textures.maskMap,
    emissive: 0x26080d,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.1,
  });
  const badgeMat = new THREE.MeshStandardMaterial({
    color: 0xf5b800,
    emissive: 0x704c00,
    emissiveIntensity: 0.5,
    roughness: 0.35,
    metalness: 0.6,
  });

  // Ground contact shadow
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 1.3),
    new THREE.MeshBasicMaterial({
      map: textures.glowMap,
      color: 0x050507,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.015;
  group.add(pool);

  // 1-2. Stiff jointed legs
  const legGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.88, 10);
  const legL = new THREE.Mesh(legGeo, limbMat);
  legL.position.set(-0.15, 0.44, 0);
  const legR = new THREE.Mesh(legGeo, limbMat);
  legR.position.set(0.15, 0.44, 0);
  group.add(legL, legR);

  // 3. Industrial toy-mannequin torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.68, 0.24), suitMat);
  torso.position.y = 1.22;
  group.add(torso);

  // 4. Yellow factory badge plate
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 6), badgeMat);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0.1, 1.34, 0.13);
  group.add(badge);

  // 5-6. Jointed dangling arms
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.038, 0.78, 8), limbMat);
  armL.position.set(-0.31, 1.14, 0.08);
  armL.rotation.z = 0.16;
  armL.rotation.x = -0.32;
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.038, 0.78, 8), limbMat);
  armR.position.set(0.31, 1.14, 0.08);
  armR.rotation.z = -0.16;
  armR.rotation.x = -0.32;
  group.add(armL, armR);

  // 7-8. Shoulder joint spheres
  const jointGeo = new THREE.SphereGeometry(0.075, 10, 10);
  const shL = new THREE.Mesh(jointGeo, badgeMat);
  shL.position.set(-0.27, 1.5, 0);
  const shR = new THREE.Mesh(jointGeo, badgeMat);
  shR.position.set(0.27, 1.5, 0);
  group.add(shL, shR);

  // 9. Crooked neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 8), limbMat);
  neck.position.y = 1.62;
  group.add(neck);

  // 10. Porcelain stitched mask head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.82, 0.02);
  headGroup.rotation.z = -0.18;
  group.add(headGroup);

  const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 14), limbMat);
  headGroup.add(headSphere);

  const maskPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.19, 0.34, 16, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
    maskMat,
  );
  maskPlate.position.z = 0.03;
  headGroup.add(maskPlate);

  // Generous invisible hitbox on layer 1 for easy touch/click/Quest trigger
  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 2.2, 0.9),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = 1.05;
  hitbox.layers.set(1);
  hitbox.userData.anomalyId = id;
  group.add(hitbox);

  return {
    id,
    kind: 'figura',
    group,
    hitbox,
    materials: [suitMat, limbMat, maskMat, badgeMat],
    coreParts: [headGroup, armL, armR, legL, legR],
    baseX: x,
    baseY: 0,
    baseZ: z,
    defeated: false,
    dissolveProgress: 0,
    alertPlayed: false,
    creepSpeed: 1.55,
    mountSide: 'floor',
  };
}

export function createDoorArch(
  z: number,
  corridorWidth: number,
  ceilingHeight: number,
  isRoomEntrance: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0, z);

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1e1612,
    roughness: 0.78,
    metalness: 0.12,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xb3842d,
    metalness: 0.85,
    roughness: 0.28,
  });

  const pillarW = isRoomEntrance ? 0.55 : 0.34;
  const sideX = corridorWidth / 2 - pillarW / 2;

  // Left & right pillars
  const pillarGeo = new THREE.BoxGeometry(pillarW, ceilingHeight, 0.32);
  const pL = new THREE.Mesh(pillarGeo, frameMat);
  pL.position.set(-sideX, ceilingHeight / 2, 0);
  const pR = new THREE.Mesh(pillarGeo, frameMat);
  pR.position.set(sideX, ceilingHeight / 2, 0);
  group.add(pL, pR);

  // Top lintel
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(corridorWidth, 0.48, 0.36),
    frameMat,
  );
  lintel.position.set(0, ceilingHeight - 0.24, 0);
  group.add(lintel);

  // Ajar wooden door on side
  if (isRoomEntrance) {
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-corridorWidth / 2 + pillarW, 0, 0.05);
    doorPivot.rotation.y = 0.92;
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.55, 0.08), frameMat);
    doorPanel.position.set(0.55, 1.275, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), brassMat);
    knob.position.set(0.95, 1.15, 0.06);
    doorPivot.add(doorPanel, knob);
    group.add(doorPivot);
  }

  return group;
}

export function createSideProp(
  kind: 'crates' | 'blocks' | 'cabinet',
  x: number,
  z: number,
  textures: ProceduralTextureSet,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodMap,
    roughness: 0.85,
    metalness: 0.05,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: textures.hazardMap,
    roughness: 0.68,
    metalness: 0.2,
  });

  if (kind === 'crates') {
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), woodMat);
    c1.position.y = 0.375;
    c1.rotation.y = 0.22;
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), hazardMat);
    c2.position.set(0.06, 0.75 + 0.26, -0.04);
    c2.rotation.y = -0.35;
    const c3 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), woodMat);
    c3.position.set(-0.45, 0.21, 0.38);
    c3.rotation.y = 0.5;
    group.add(c1, c2, c3);
  } else if (kind === 'blocks') {
    // Unsettling oversized Poppy-style toy blocks
    const colors = [0xb91c1c, 0xd97706, 0x0f766e];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshStandardMaterial({
        color: colors[i],
        roughness: 0.55,
        metalness: 0.1,
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), m);
      b.position.set(i === 2 ? 0.08 : (i - 0.5) * 0.48, i === 2 ? 0.69 : 0.23, i * 0.08);
      b.rotation.y = (i - 1) * 0.28;
      group.add(b);
    }
  } else {
    // Tall dusty cabinet
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 2.05, 0.54), woodMat);
    body.position.y = 1.025;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.1, 0.58), hazardMat);
    trim.position.y = 2.02;
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0xc9963b, metalness: 0.9, roughness: 0.2 }),
    );
    handle.position.set(0.24, 1.05, 0.29);
    group.add(body, trim, handle);
  }

  return group;
}

export function createExitDoor(z: number, textures: ProceduralTextureSet): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0, z);

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x1a2024,
    metalness: 0.85,
    roughness: 0.32,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: textures.hazardMap,
    roughness: 0.65,
    metalness: 0.2,
  });
  const signMat = new THREE.MeshStandardMaterial({
    map: textures.exitSignMap,
    emissive: 0x10b981,
    emissiveMap: textures.exitSignMap,
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });

  // 1. Heavy steel door frame
  const doorSlab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 0.22), steelMat);
  doorSlab.position.y = 1.4;
  group.add(doorSlab);

  // 2. Hazard warning crossbars
  const barTop = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.22, 0.26), hazardMat);
  barTop.position.y = 2.75;
  const barBot = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.22, 0.26), hazardMat);
  barBot.position.y = 0.14;
  group.add(barTop, barBot);

  // 3. Push bar
  const pushBar = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.1, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.7 }),
  );
  pushBar.position.set(0, 1.15, 0.14);
  group.add(pushBar);

  // 4. Illuminated Spanish "SALIDA" sign above door
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.46, 0.12), signMat);
  sign.position.set(0, 3.12, 0.12);
  group.add(sign);

  return group;
}

export function createSchoolLockerBank(
  x: number,
  z: number,
  side: -1 | 1,
  textures: ProceduralTextureSet,
  ajarSlot = 1,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  // Face inward toward the corridor center
  group.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1b242c,
    metalness: 0.65,
    roughness: 0.48,
  });
  const doorMat = new THREE.MeshStandardMaterial({
    map: textures.lockerMap,
    metalness: 0.55,
    roughness: 0.42,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4ad,
    metalness: 0.9,
    roughness: 0.22,
  });

  // 1. Locker bank main chassis & dark interior recess
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.68, 2.05, 0.42), bodyMat);
  chassis.position.set(0, 1.025, -0.04);
  group.add(chassis);

  // 2. Top kick-plate / slanted cornice & bottom plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.1, 0.46), bodyMat);
  plinth.position.set(0, 0.05, 0);
  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 0.46), bodyMat);
  topTrim.position.set(0, 2.07, 0);
  group.add(plinth, topTrim);

  // 3. Three individual locker doors (one left slightly ajar for eerie depth)
  const doorW = 0.52;
  for (let i = 0; i < 3; i++) {
    const dx = (i - 1) * 0.55;
    const pivot = new THREE.Group();
    pivot.position.set(dx - doorW / 2, 1.05, 0.19);
    if (i === ajarSlot) {
      pivot.rotation.y = 0.42;
    }

    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, 1.88, 0.03), doorMat);
    door.position.set(doorW / 2, 0, 0);
    pivot.add(door);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.04), chromeMat);
    handle.position.set(doorW - 0.07, 0.04, 0.025);
    pivot.add(handle);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.055, 0.02), chromeMat);
    plate.position.set(doorW / 2, 0.72, 0.02);
    pivot.add(plate);

    group.add(pivot);
  }

  return group;
}

export function createSchoolDesk(
  x: number,
  z: number,
  textures: ProceduralTextureSet,
  rotY = 0,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodMap,
    roughness: 0.76,
    metalness: 0.05,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x252a30,
    metalness: 0.82,
    roughness: 0.34,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x38281c,
    roughness: 0.68,
    metalness: 0.08,
  });

  // 1. Desktop surface
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.045, 0.52), woodMat);
  top.position.set(0, 0.74, 0);
  group.add(top);

  // 2. Under-desk metal book basket
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.38), frameMat);
  rack.position.set(0, 0.61, 0.02);
  group.add(rack);

  // 3-6. Four tubular steel desk legs grounded at y = 0
  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.73, 8);
  const legOffsets: [number, number][] = [
    [-0.33, -0.21],
    [0.33, -0.21],
    [-0.33, 0.21],
    [0.33, 0.21],
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(legGeo, frameMat);
    leg.position.set(lx, 0.365, lz);
    group.add(leg);
  }

  // 7-9. Attached student chair tucked slightly behind desk (+Z)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), seatMat);
  seat.position.set(0, 0.45, 0.46);
  group.add(seat);

  const backRest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.28, 0.04), seatMat);
  backRest.position.set(0, 0.74, 0.66);
  group.add(backRest);

  const chairLegGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.45, 8);
  const cOffsets: [number, number][] = [
    [-0.18, 0.29],
    [0.18, 0.29],
    [-0.18, 0.63],
    [0.18, 0.63],
  ];
  for (const [cx, cz] of cOffsets) {
    const cl = new THREE.Mesh(chairLegGeo, frameMat);
    cl.position.set(cx, 0.225, cz);
    group.add(cl);
  }

  return group;
}

export function createChalkboardModel(
  x: number,
  y: number,
  z: number,
  rotY: number,
  textures: ProceduralTextureSet,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotY;

  const boardMat = new THREE.MeshStandardMaterial({
    map: textures.chalkboardMap,
    roughness: 0.9,
    metalness: 0.04,
  });
  const oakMat = new THREE.MeshStandardMaterial({
    color: 0x3b2818,
    roughness: 0.72,
    metalness: 0.08,
  });
  const chalkMat = new THREE.MeshStandardMaterial({
    color: 0xe8ece8,
    roughness: 0.95,
  });

  // 1. Slate green chalkboard surface
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.45, 0.05), boardMat);
  group.add(board);

  // 2. Wooden outer border bars
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.08, 0.09), oakMat);
  topBar.position.y = 0.74;
  const botTray = new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.08, 0.16), oakMat);
  botTray.position.set(0, -0.74, 0.03);
  const leftBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.54, 0.09), oakMat);
  leftBar.position.x = -1.62;
  const rightBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.54, 0.09), oakMat);
  rightBar.position.x = 1.62;
  group.add(topBar, botTray, leftBar, rightBar);

  // 3. Chalk sticks & felt eraser resting on tray
  const chalk1 = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 6), chalkMat);
  chalk1.rotation.z = Math.PI / 2;
  chalk1.position.set(-0.6, -0.68, 0.08);
  const eraser = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.045, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.92 }),
  );
  eraser.position.set(0.4, -0.68, 0.08);
  group.add(chalk1, eraser);

  return group;
}

export function createSchoolDoorArch(
  z: number,
  corridorWidth: number,
  ceilingHeight: number,
  isClassroomEntry: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0, z);

  const metalFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1a2226,
    metalness: 0.65,
    roughness: 0.42,
  });
  const doorWoodMat = new THREE.MeshStandardMaterial({
    color: 0x2c2219,
    roughness: 0.74,
    metalness: 0.1,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1c282e,
    emissive: 0x071216,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.15,
  });

  const pillarW = isClassroomEntry ? 0.52 : 0.32;
  const sideX = corridorWidth / 2 - pillarW / 2;

  const pillarGeo = new THREE.BoxGeometry(pillarW, ceilingHeight, 0.34);
  const pL = new THREE.Mesh(pillarGeo, metalFrameMat);
  pL.position.set(-sideX, ceilingHeight / 2, 0);
  const pR = new THREE.Mesh(pillarGeo, metalFrameMat);
  pR.position.set(sideX, ceilingHeight / 2, 0);
  group.add(pL, pR);

  // Upper transom header + dark glass pane
  const transomFrame = new THREE.Mesh(
    new THREE.BoxGeometry(corridorWidth, 0.52, 0.36),
    metalFrameMat,
  );
  transomFrame.position.set(0, ceilingHeight - 0.26, 0);
  group.add(transomFrame);

  if (isClassroomEntry) {
    const transomGlass = new THREE.Mesh(
      new THREE.BoxGeometry(corridorWidth - 1.4, 0.26, 0.12),
      glassMat,
    );
    transomGlass.position.set(0, ceilingHeight - 0.26, 0);
    group.add(transomGlass);

    const doorPivot = new THREE.Group();
    doorPivot.position.set(corridorWidth / 2 - pillarW, 0, 0.05);
    doorPivot.rotation.y = -0.88;
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.12, 2.55, 0.08), doorWoodMat);
    doorPanel.position.set(-0.56, 1.275, 0);
    const doorWindow = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.64, 0.1), glassMat);
    doorWindow.position.set(-0.56, 1.85, 0);
    doorPivot.add(doorPanel, doorWindow);
    group.add(doorPivot);
  }

  return group;
}

export function createPrefectaModel(
  id: number,
  x: number,
  z: number,
  textures: ProceduralTextureSet,
): AnomalyActor {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const coatMat = new THREE.MeshStandardMaterial({
    color: 0x181c24,
    roughness: 0.82,
    metalness: 0.12,
    transparent: true,
    opacity: 0.98,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x5c1824,
    roughness: 0.65,
    metalness: 0.15,
    transparent: true,
    opacity: 0.98,
  });
  const faceMat = new THREE.MeshStandardMaterial({
    map: textures.prefectaFaceMap,
    emissive: 0x1c1216,
    emissiveIntensity: 0.45,
    roughness: 0.68,
    transparent: true,
    opacity: 0.98,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xe5a93b,
    emissive: 0x9c2818,
    emissiveIntensity: 0.65,
    metalness: 0.85,
    roughness: 0.24,
    transparent: true,
    opacity: 0.98,
  });

  // Ground contact shadow pool
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: textures.glowMap,
      color: 0x050508,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.015;
  group.add(pool);

  // 1. Tall trenchcoat lower skirt
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 1.15, 12), coatMat);
  skirt.position.y = 0.575;
  group.add(skirt);

  // 2. Rigid torso & school monitor sash
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.28), coatMat);
  torso.position.y = 1.48;
  group.add(torso);

  const sash = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.3), trimMat);
  sash.position.y = 1.52;
  sash.rotation.z = -0.35;
  group.add(sash);

  // 3. Brass whistle / monitor medallion on chest
  const whistle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 10), brassMat);
  whistle.rotation.z = Math.PI / 2;
  whistle.position.set(0, 1.56, 0.17);
  group.add(whistle);

  // 4-5. Long rigid arms + pointing ruler/lantern arm
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.88, 8), coatMat);
  armL.position.set(-0.34, 1.38, 0.06);
  armL.rotation.z = 0.14;
  armL.rotation.x = -0.18;
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.88, 8), coatMat);
  armR.position.set(0.34, 1.38, 0.14);
  armR.rotation.z = -0.14;
  armR.rotation.x = -0.45;
  group.add(armL, armR);

  // Pointing broken wooden ruler in right hand
  const ruler = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.72), brassMat);
  ruler.position.set(0.36, 1.05, 0.48);
  ruler.rotation.x = -0.25;
  group.add(ruler);

  // 6. Blank stitched head + brimmed monitor hat
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.04, 0.03);
  group.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 14), faceMat);
  head.scale.set(0.88, 1.15, 0.9);
  head.rotation.y = -Math.PI / 2;
  headGroup.add(head);

  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.035, 14), trimMat);
  hatBrim.position.y = 0.18;
  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 14), coatMat);
  hatCrown.position.y = 0.26;
  headGroup.add(hatBrim, hatCrown);

  // Generous invisible hitbox on layer 1
  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 2.4, 0.9),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = 1.2;
  hitbox.layers.set(1);
  hitbox.userData.anomalyId = id;
  group.add(hitbox);

  return {
    id,
    kind: 'prefecta',
    group,
    hitbox,
    materials: [coatMat, trimMat, faceMat, brassMat],
    coreParts: [headGroup, armL, armR, whistle],
    baseX: x,
    baseY: 0,
    baseZ: z,
    defeated: false,
    dissolveProgress: 0,
    alertPlayed: false,
    creepSpeed: 1.45,
    mountSide: 'floor',
  };
}

export function createAlumnaModel(
  id: number,
  x: number,
  z: number,
  textures: ProceduralTextureSet,
): AnomalyActor {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const blazerMat = new THREE.MeshStandardMaterial({
    color: 0x16242b,
    roughness: 0.78,
    metalness: 0.08,
  });
  const chalkLimbMat = new THREE.MeshStandardMaterial({
    color: 0xb8c4c2,
    roughness: 0.88,
    metalness: 0.04,
  });
  const faceMat = new THREE.MeshStandardMaterial({
    map: textures.alumnaFaceMap,
    emissive: 0x0c4a5e,
    emissiveIntensity: 0.95,
    roughness: 0.32,
    metalness: 0.08,
  });
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x67e8f9,
    emissive: 0x22d3ee,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });

  // Ground contact shadow
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 1.3),
    new THREE.MeshBasicMaterial({
      map: textures.glowMap,
      color: 0x040709,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.015;
  group.add(pool);

  // 1-2. Chalk-white legs
  const legGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.82, 8);
  const legL = new THREE.Mesh(legGeo, chalkLimbMat);
  legL.position.set(-0.14, 0.41, 0);
  const legR = new THREE.Mesh(legGeo, chalkLimbMat);
  legR.position.set(0.14, 0.41, 0);
  group.add(legL, legR);

  // 3. Pleated school skirt & uniform torso
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.44, 12), blazerMat);
  skirt.position.y = 0.86;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.56, 0.22), blazerMat);
  torso.position.y = 1.24;
  group.add(skirt, torso);

  // Ribbon collar
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), shardMat);
  ribbon.position.set(0, 1.44, 0.12);
  group.add(ribbon);

  // 4-5. Long crooked arms reaching forward
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.032, 0.74, 8), chalkLimbMat);
  armL.position.set(-0.27, 1.2, 0.14);
  armL.rotation.z = 0.18;
  armL.rotation.x = -0.58;
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.032, 0.74, 8), chalkLimbMat);
  armR.position.set(0.27, 1.2, 0.14);
  armR.rotation.z = -0.18;
  armR.rotation.x = -0.58;
  group.add(armL, armR);

  // 6. Cracked cyan-eyed chalk-porcelain head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.72, 0.02);
  headGroup.rotation.z = 0.22;
  group.add(headGroup);

  const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 14), blazerMat);
  headGroup.add(headSphere);

  const maskPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.18, 0.32, 14, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
    faceMat,
  );
  maskPlate.position.z = 0.03;
  headGroup.add(maskPlate);

  // 7. Orbiting floating chalk fragments (visual armor ring)
  const orbitRing = new THREE.Group();
  orbitRing.position.y = 1.2;
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), shardMat);
    shard.position.set(Math.cos(ang) * 0.5, Math.sin(ang * 2) * 0.14, Math.sin(ang) * 0.5);
    orbitRing.add(shard);
  }
  group.add(orbitRing);

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 2.2, 0.95),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = 1.05;
  hitbox.layers.set(1);
  hitbox.userData.anomalyId = id;
  group.add(hitbox);

  return {
    id,
    kind: 'alumna',
    group,
    hitbox,
    materials: [blazerMat, chalkLimbMat, faceMat, shardMat],
    coreParts: [headGroup, armL, armR, orbitRing],
    baseX: x,
    baseY: 0,
    baseZ: z,
    defeated: false,
    dissolveProgress: 0,
    alertPlayed: false,
    creepSpeed: 1.48,
    mountSide: 'floor',
    hitsRemaining: 3,
    maxHits: 3,
  };
}

export function createCampanaModel(
  id: number,
  mountSide: 'left' | 'right' | 'ceiling',
  z: number,
  textures: ProceduralTextureSet,
  corridorHalfWidth: number,
  ceilingHeight: number,
  offsetCoord?: number,
): AnomalyActor {
  const group = new THREE.Group();
  let bx = 0;
  let by = 2.2;

  if (mountSide === 'left') {
    bx = -corridorHalfWidth + 0.18;
    by = offsetCoord ?? 2.15;
    group.position.set(bx, by, z);
    group.rotation.y = Math.PI / 3;
  } else if (mountSide === 'right') {
    bx = corridorHalfWidth - 0.18;
    by = offsetCoord ?? 2.15;
    group.position.set(bx, by, z);
    group.rotation.y = -Math.PI / 3;
  } else {
    bx = offsetCoord ?? 0;
    by = ceilingHeight - 0.18;
    group.position.set(bx, by, z);
  }

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x261c1a,
    metalness: 0.85,
    roughness: 0.42,
  });
  const tendrilMat = new THREE.MeshStandardMaterial({
    color: 0x16090c,
    emissive: 0x3b0812,
    emissiveIntensity: 0.55,
    roughness: 0.65,
  });
  const clapperMat = new THREE.MeshStandardMaterial({
    color: 0xff2b3d,
    emissive: 0xff1a30,
    emissiveIntensity: 2.2,
    roughness: 0.15,
  });

  // 1. Iron mount bracket
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.32), ironMat);
  bracket.position.y = 0.12;
  group.add(bracket);

  // 2. Swinging bell pivot
  const bellPivot = new THREE.Group();
  bellPivot.position.y = -0.05;
  group.add(bellPivot);

  // Bell dome + flared bell skirt
  const bellCrown = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), ironMat);
  bellCrown.position.y = -0.15;
  const bellSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 0.48, 16, 1, true), ironMat);
  bellSkirt.material.side = THREE.DoubleSide;
  bellSkirt.position.y = -0.38;
  const bellRim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 20), ironMat);
  bellRim.rotation.x = Math.PI / 2;
  bellRim.position.y = -0.62;
  bellPivot.add(bellCrown, bellSkirt, bellRim);

  // 3. Glowing crimson clapper-eye inside bell
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), clapperMat);
  clapper.position.y = -0.58;
  bellPivot.add(clapper);

  // 4. Crimson shockwave ring around bell
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.022, 8, 24), clapperMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.56;
  group.add(ring);

  // 5-8. Dark iron anchor tendrils gripping wall/ceiling
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.55, 7), tendrilMat);
    t.position.set(Math.cos(ang) * 0.36, 0.02, Math.sin(ang) * 0.36);
    t.rotation.z = -Math.cos(ang) * 0.9;
    t.rotation.x = Math.sin(ang) * 0.9;
    group.add(t);
  }

  // Contact shadow/glow pool on wall/ceiling
  const aura = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({
      map: textures.glowMap,
      color: 0xff1e33,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  aura.rotation.x = Math.PI / 2;
  aura.position.y = -0.58;
  group.add(aura);

  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 10, 10),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = -0.35;
  hitbox.layers.set(1);
  hitbox.userData.anomalyId = id;
  group.add(hitbox);

  return {
    id,
    kind: 'campana',
    group,
    hitbox,
    materials: [ironMat, tendrilMat, clapperMat],
    coreParts: [bellPivot, ring, clapper],
    baseX: bx,
    baseY: by,
    baseZ: z,
    defeated: false,
    dissolveProgress: 0,
    alertPlayed: false,
    creepSpeed: 0,
    mountSide,
  };
}

export interface BedroomCutsceneRig {
  root: THREE.Group;
  doorPivot: THREE.Group;
  guyGroup: THREE.Group;
  guyTorsoPivot: THREE.Group;
  guyHead: THREE.Group;
  guyLegsPivot: THREE.Group;
  guyRightArm: THREE.Group;
  guyLeftArm: THREE.Group;
  phoneGroup: THREE.Group;
  phoneLight: THREE.PointLight;
  lampLight: THREE.PointLight;
  flashlightProp: THREE.Group;
}

export function createBedroomCutsceneSet(
  textures: ProceduralTextureSet,
  corridorWidth: number,
  ceilingHeight: number,
): BedroomCutsceneRig {
  const root = new THREE.Group();

  const floorMat = new THREE.MeshStandardMaterial({
    map: textures.woodMap,
    roughnessMap: textures.woodRoughness,
    roughness: 0.85,
    metalness: 0.05,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: textures.wallpaperMap,
    roughness: 0.88,
    metalness: 0.04,
  });
  const ceilMat = new THREE.MeshStandardMaterial({
    map: textures.ceilingMap,
    roughness: 0.92,
  });
  const woodFrameMat = new THREE.MeshStandardMaterial({
    color: 0x2a1d14,
    roughness: 0.72,
    metalness: 0.1,
  });
  const sheetMat = new THREE.MeshStandardMaterial({
    color: 0x222c3a,
    roughness: 0.9,
  });
  const blanketMat = new THREE.MeshStandardMaterial({
    color: 0x3b1f2b,
    roughness: 0.92,
  });
  const pillowMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.88,
  });

  // Bedroom extends from z = 1.4 (doorway into hallway) to z = 8.4 (back bedroom wall)
  const roomW = 5.4;
  const roomLen = 7.0;
  const roomCenterZ = 4.9;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomLen), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.005, roomCenterZ);
  floor.receiveShadow = true;
  root.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomLen), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ceilingHeight, roomCenterZ);
  root.add(ceil);

  const sideGeo = new THREE.PlaneGeometry(roomLen, ceilingHeight);
  const wL = new THREE.Mesh(sideGeo, wallMat);
  wL.rotation.y = Math.PI / 2;
  wL.position.set(-roomW / 2, ceilingHeight / 2, roomCenterZ);
  const wR = new THREE.Mesh(sideGeo, wallMat);
  wR.rotation.y = -Math.PI / 2;
  wR.position.set(roomW / 2, ceilingHeight / 2, roomCenterZ);
  const wBack = new THREE.Mesh(new THREE.PlaneGeometry(roomW, ceilingHeight), wallMat);
  wBack.rotation.y = Math.PI;
  wBack.position.set(0, ceilingHeight / 2, 8.4);
  root.add(wL, wR, wBack);

  // Partition wall at z = 1.4 separating bedroom from hallway with central doorway (1.3m wide)
  const sidePanelW = (roomW - 1.3) / 2;
  const pLeft = new THREE.Mesh(new THREE.BoxGeometry(sidePanelW, ceilingHeight, 0.16), wallMat);
  pLeft.position.set(-0.65 - sidePanelW / 2, ceilingHeight / 2, 1.4);
  const pRight = new THREE.Mesh(new THREE.BoxGeometry(sidePanelW, ceilingHeight, 0.16), wallMat);
  pRight.position.set(0.65 + sidePanelW / 2, ceilingHeight / 2, 1.4);
  const header = new THREE.Mesh(new THREE.BoxGeometry(1.34, ceilingHeight - 2.45, 0.18), wallMat);
  header.position.set(0, 2.45 + (ceilingHeight - 2.45) / 2, 1.4);
  root.add(pLeft, pRight, header);

  // Side connector strips if corridorWidth differs
  if (roomW > corridorWidth) {
    const frameTrimL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.22), woodFrameMat);
    frameTrimL.position.set(-0.65, 1.25, 1.4);
    const frameTrimR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.22), woodFrameMat);
    frameTrimR.position.set(0.65, 1.25, 1.4);
    root.add(frameTrimL, frameTrimR);
  }

  // Hinged Bedroom Door (pivots from left jamb into hallway -Z)
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.62, 0, 1.36);
  const doorSlab = new THREE.Mesh(new THREE.BoxGeometry(1.24, 2.42, 0.08), woodFrameMat);
  doorSlab.position.set(0.62, 1.21, 0);
  const doorKnob = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xd4a338, metalness: 0.9, roughness: 0.2 }),
  );
  doorKnob.position.set(1.12, 1.1, 0.06);
  doorPivot.add(doorSlab, doorKnob);
  root.add(doorPivot);

  // Bed against right-back corner (x = 1.2, z = 5.6)
  const bedGroup = new THREE.Group();
  bedGroup.position.set(1.2, 0, 5.6);
  const bedBase = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.36, 2.35), woodFrameMat);
  bedBase.position.y = 0.22;
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.72, 1.05, 0.12), woodFrameMat);
  headboard.position.set(0, 0.56, 1.14);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.24, 2.2), sheetMat);
  mattress.position.y = 0.52;
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, 0.48), pillowMat);
  pillow.position.set(0, 0.7, 0.78);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.16, 1.42), blanketMat);
  blanket.position.set(0, 0.62, -0.34);
  bedGroup.add(bedBase, headboard, mattress, pillow, blanket);
  root.add(bedGroup);

  // Nightstand & bedside warm lamp + resting flashlight (x = -0.15, z = 6.25)
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.55), woodFrameMat);
  stand.position.set(-0.15, 0.31, 6.25);
  root.add(stand);

  const lampBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 0.24, 10),
    new THREE.MeshStandardMaterial({ color: 0x3b3d42, metalness: 0.7, roughness: 0.3 }),
  );
  lampBase.position.set(-0.22, 0.74, 6.32);
  const lampShade = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.24, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      emissive: 0xd97706,
      emissiveIntensity: 0.75,
      side: THREE.DoubleSide,
    }),
  );
  lampShade.position.set(-0.22, 0.94, 6.32);
  root.add(lampBase, lampShade);

  const lampLight = new THREE.PointLight(0xffb454, 1.4, 7.5, 1.8);
  lampLight.position.set(-0.22, 0.9, 6.25);
  root.add(lampLight);

  // Flashlight resting on nightstand
  const flashlightProp = new THREE.Group();
  flashlightProp.position.set(-0.02, 0.66, 6.08);
  flashlightProp.rotation.y = 0.45;
  const flBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.03, 0.24, 10),
    new THREE.MeshStandardMaterial({ color: 0x181a1f, metalness: 0.85, roughness: 0.25 }),
  );
  flBody.rotation.x = Math.PI / 2;
  const flHead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.034, 0.07, 10),
    new THREE.MeshStandardMaterial({ color: 0xf5b800, metalness: 0.6, roughness: 0.3 }),
  );
  flHead.rotation.x = Math.PI / 2;
  flHead.position.z = -0.14;
  flashlightProp.add(flBody, flHead);
  root.add(flashlightProp);

  // Guy character lying on bed scrolling TikTok, then standing & walking out
  const guyGroup = new THREE.Group();
  guyGroup.position.set(1.2, 0.68, 6.0);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd6a688, roughness: 0.68 });
  const hoodieMat = new THREE.MeshStandardMaterial({ color: 0x2c3648, roughness: 0.84 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x181b22, roughness: 0.88 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 0.92 });

  const guyLegsPivot = new THREE.Group();
  const legGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.78, 10);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.11, -0.39, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.11, -0.39, 0);
  guyLegsPivot.add(legL, legR);
  guyGroup.add(guyLegsPivot);

  const guyTorsoPivot = new THREE.Group();
  guyGroup.add(guyTorsoPivot);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.22), hoodieMat);
  torso.position.y = 0.29;
  guyTorsoPivot.add(torso);

  const guyHead = new THREE.Group();
  guyHead.position.set(0, 0.72, 0);
  const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), skinMat);
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.152, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairMat,
  );
  hairCap.position.y = 0.02;
  guyHead.add(headSphere, hairCap);
  guyTorsoPivot.add(guyHead);

  const guyLeftArm = new THREE.Group();
  guyLeftArm.position.set(-0.26, 0.52, 0);
  const armMeshL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.5, 8), hoodieMat);
  armMeshL.position.y = -0.24;
  guyLeftArm.add(armMeshL);
  guyTorsoPivot.add(guyLeftArm);

  const guyRightArm = new THREE.Group();
  guyRightArm.position.set(0.26, 0.52, 0);
  const armMeshR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.5, 8), hoodieMat);
  armMeshR.position.y = -0.24;
  guyRightArm.add(armMeshR);
  guyTorsoPivot.add(guyRightArm);

  // Smartphone with glowing TikTok feed held in right hand
  const phoneGroup = new THREE.Group();
  phoneGroup.position.set(-0.08, -0.46, 0.12);
  const phoneCase = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.21, 0.016),
    new THREE.MeshStandardMaterial({ color: 0x0b0d12, metalness: 0.85, roughness: 0.2 }),
  );
  const phoneScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.098, 0.192),
    new THREE.MeshStandardMaterial({
      map: textures.tiktokScreenMap,
      emissive: 0xffffff,
      emissiveMap: textures.tiktokScreenMap,
      emissiveIntensity: 1.55,
      roughness: 0.12,
    }),
  );
  phoneScreen.position.z = 0.009;
  phoneGroup.add(phoneCase, phoneScreen);

  const phoneLight = new THREE.PointLight(0x38bdf8, 1.15, 2.8, 1.8);
  phoneLight.position.set(0, 0, 0.18);
  phoneGroup.add(phoneLight);

  guyRightArm.add(phoneGroup);
  root.add(guyGroup);

  return {
    root,
    doorPivot,
    guyGroup,
    guyTorsoPivot,
    guyHead,
    guyLegsPivot,
    guyRightArm,
    guyLeftArm,
    phoneGroup,
    phoneLight,
    lampLight,
    flashlightProp,
  };
}

export interface ClassroomCutsceneRig {
  root: THREE.Group;
  doorPivot: THREE.Group;
  teacherGroup: THREE.Group;
  teacherHead: THREE.Group;
  teacherRightArm: THREE.Group;
  teacherLeftArm: THREE.Group;
  roomLight: THREE.PointLight;
  flashlightProp: THREE.Group;
}

export function createClassroomCutsceneSet(
  textures: ProceduralTextureSet,
  corridorWidth: number,
  ceilingHeight: number,
): ClassroomCutsceneRig {
  const root = new THREE.Group();

  const floorMat = new THREE.MeshStandardMaterial({
    map: textures.linoleumMap,
    roughnessMap: textures.linoleumRoughness,
    roughness: 0.74,
    metalness: 0.08,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: textures.schoolWallMap,
    roughness: 0.84,
    metalness: 0.05,
  });
  const ceilMat = new THREE.MeshStandardMaterial({
    map: textures.acousticCeilingMap,
    roughness: 0.94,
    metalness: 0.04,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1a2226,
    metalness: 0.65,
    roughness: 0.42,
  });
  const doorWoodMat = new THREE.MeshStandardMaterial({
    color: 0x332418,
    roughness: 0.72,
    metalness: 0.1,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1a2a30,
    emissive: 0x061014,
    emissiveIntensity: 0.4,
    roughness: 0.2,
    metalness: 0.15,
  });

  // Classroom spans z = 1.4 (corridor doorway) to z = 9.4 (front chalkboard wall)
  const roomW = 7.4;
  const roomLen = 8.0;
  const roomCenterZ = 5.4;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomLen), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.005, roomCenterZ);
  floor.receiveShadow = true;
  root.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomLen), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ceilingHeight, roomCenterZ);
  root.add(ceil);

  const sideGeo = new THREE.PlaneGeometry(roomLen, ceilingHeight);
  const wL = new THREE.Mesh(sideGeo, wallMat);
  wL.rotation.y = Math.PI / 2;
  wL.position.set(-roomW / 2, ceilingHeight / 2, roomCenterZ);
  const wR = new THREE.Mesh(sideGeo, wallMat);
  wR.rotation.y = -Math.PI / 2;
  wR.position.set(roomW / 2, ceilingHeight / 2, roomCenterZ);
  const wFront = new THREE.Mesh(new THREE.PlaneGeometry(roomW, ceilingHeight), wallMat);
  wFront.rotation.y = Math.PI;
  wFront.position.set(0, ceilingHeight / 2, 9.4);
  root.add(wL, wR, wFront);

  // Partition wall at z = 1.4 separating classroom from dark hallway
  const sidePanelW = (roomW - 1.32) / 2;
  const pLeft = new THREE.Mesh(new THREE.BoxGeometry(sidePanelW, ceilingHeight, 0.16), wallMat);
  pLeft.position.set(-0.66 - sidePanelW / 2, ceilingHeight / 2, 1.4);
  const pRight = new THREE.Mesh(new THREE.BoxGeometry(sidePanelW, ceilingHeight, 0.16), wallMat);
  pRight.position.set(0.66 + sidePanelW / 2, ceilingHeight / 2, 1.4);
  const header = new THREE.Mesh(new THREE.BoxGeometry(1.36, ceilingHeight - 2.48, 0.18), wallMat);
  header.position.set(0, 2.48 + (ceilingHeight - 2.48) / 2, 1.4);
  root.add(pLeft, pRight, header);

  if (roomW > corridorWidth) {
    const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.52, 0.22), frameMat);
    jambL.position.set(-0.66, 1.26, 1.4);
    const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.52, 0.22), frameMat);
    jambR.position.set(0.66, 1.26, 1.4);
    root.add(jambL, jambR);
  }

  // Hinged school classroom door with glass vision slit
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.63, 0, 1.36);
  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.26, 2.45, 0.08), doorWoodMat);
  doorPanel.position.set(0.63, 1.225, 0);
  const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.68, 0.095), glassMat);
  doorGlass.position.set(0.84, 1.72, 0);
  const doorHandle = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.035, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.9, roughness: 0.25 }),
  );
  doorHandle.position.set(1.12, 1.08, 0.05);
  doorPivot.add(doorPanel, doorGlass, doorHandle);
  root.add(doorPivot);

  // Front chalkboard (facing -Z toward student desks)
  root.add(createChalkboardModel(0, 1.85, 9.3, Math.PI, textures));

  // Student desks (all facing +Z toward teacher & chalkboard; player sits at (-1.25, 5.4))
  const deskPositions: [number, number, number][] = [
    [-1.25, 5.4, Math.PI],
    [1.25, 5.4, Math.PI],
    [-1.25, 3.55, Math.PI],
    [1.25, 3.55, Math.PI],
  ];
  for (const [dx, dz, rot] of deskPositions) {
    root.add(createSchoolDesk(dx, dz, textures, rot));
  }

  // Open notebook & pencil on player's desk (-1.25, 5.4)
  const notebook = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.018, 0.24),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9 }),
  );
  notebook.position.set(-1.35, 0.772, 5.42);
  notebook.rotation.y = 0.08;
  const pencil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6),
    new THREE.MeshStandardMaterial({ color: 0xf5b800, roughness: 0.55 }),
  );
  pencil.rotation.z = Math.PI / 2;
  pencil.rotation.y = -0.3;
  pencil.position.set(-1.12, 0.772, 5.38);
  root.add(notebook, pencil);

  // Flashlight resting on right edge of player's desk
  const flashlightProp = new THREE.Group();
  flashlightProp.position.set(-0.98, 0.79, 5.48);
  flashlightProp.rotation.y = -0.45;
  const flBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.026, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0x181a1f, metalness: 0.85, roughness: 0.25 }),
  );
  flBody.rotation.x = Math.PI / 2;
  const flHead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.03, 0.065, 10),
    new THREE.MeshStandardMaterial({ color: 0xf5b800, metalness: 0.6, roughness: 0.3 }),
  );
  flHead.rotation.x = Math.PI / 2;
  flHead.position.z = 0.12;
  flashlightProp.add(flBody, flHead);
  root.add(flashlightProp);

  // Teacher's large wooden desk near front-right
  const tDeskTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.06, 0.78),
    new THREE.MeshStandardMaterial({ map: textures.woodMap, roughness: 0.72 }),
  );
  tDeskTop.position.set(0.35, 0.76, 7.65);
  const tDeskBody = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.72, 0.68), doorWoodMat);
  tDeskBody.position.set(0.35, 0.36, 7.65);
  root.add(tDeskTop, tDeskBody);

  // Teacher 3D composite character standing behind desk facing class (-Z)
  const teacherGroup = new THREE.Group();
  teacherGroup.position.set(-0.45, 0, 8.2);
  teacherGroup.rotation.y = Math.PI; // local +Z faces -Z (toward students)

  const suitMat = new THREE.MeshStandardMaterial({ color: 0x1e242d, roughness: 0.82 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xdbe1e8, roughness: 0.85 });
  const tieMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.65 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a486, roughness: 0.68 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x26211e, roughness: 0.9 });
  const glassesMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.25 });

  // Grounded legs & shoes
  const tLegGeo = new THREE.CylinderGeometry(0.08, 0.065, 0.84, 10);
  const tLegL = new THREE.Mesh(tLegGeo, suitMat);
  tLegL.position.set(-0.11, 0.42, 0);
  const tLegR = new THREE.Mesh(tLegGeo, suitMat);
  tLegR.position.set(0.11, 0.42, 0);
  teacherGroup.add(tLegL, tLegR);

  // Blazer torso + shirt front + tie
  const tTorso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.64, 0.24), suitMat);
  tTorso.position.y = 1.16;
  const tShirt = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, 0.255), shirtMat);
  tShirt.position.y = 1.2;
  const tTie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.265), tieMat);
  tTie.position.y = 1.18;
  teacherGroup.add(tTorso, tShirt, tTie);

  // Articulated arms
  const teacherLeftArm = new THREE.Group();
  teacherLeftArm.position.set(-0.29, 1.4, 0);
  const tArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.54, 8), suitMat);
  tArmL.position.y = -0.25;
  teacherLeftArm.add(tArmL);
  teacherGroup.add(teacherLeftArm);

  const teacherRightArm = new THREE.Group();
  teacherRightArm.position.set(0.29, 1.4, 0);
  const tArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.54, 8), suitMat);
  tArmR.position.y = -0.25;
  const pointer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.008, 0.55, 6),
    new THREE.MeshStandardMaterial({ color: 0xb48a5a, roughness: 0.6 }),
  );
  pointer.rotation.x = Math.PI / 2;
  pointer.position.set(0, -0.5, 0.25);
  teacherRightArm.add(tArmR, pointer);
  teacherGroup.add(teacherRightArm);

  // Articulated teacher head with hair & glasses
  const teacherHead = new THREE.Group();
  teacherHead.position.set(0, 1.64, 0.02);
  const tHeadMesh = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), skinMat);
  const tHair = new THREE.Mesh(
    new THREE.SphereGeometry(0.162, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairMat,
  );
  tHair.position.y = 0.025;
  const frameL = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 6, 12), glassesMat);
  frameL.position.set(-0.052, 0.02, 0.145);
  const frameR = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 6, 12), glassesMat);
  frameR.position.set(0.052, 0.02, 0.145);
  teacherHead.add(tHeadMesh, tHair, frameL, frameR);
  teacherGroup.add(teacherHead);

  root.add(teacherGroup);

  // Overhead classroom fluorescent ceiling housing + dim light
  const lampHousing = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.08, 0.3),
    new THREE.MeshStandardMaterial({
      color: 0xcffafe,
      emissive: 0x99f6e4,
      emissiveIntensity: 1.1,
      roughness: 0.3,
    }),
  );
  lampHousing.position.set(0, ceilingHeight - 0.04, 6.0);
  root.add(lampHousing);

  const roomLight = new THREE.PointLight(0xd8f3f0, 2.1, 13, 1.5);
  roomLight.position.set(0, ceilingHeight - 0.35, 6.2);
  root.add(roomLight);

  return {
    root,
    doorPivot,
    teacherGroup,
    teacherHead,
    teacherRightArm,
    teacherLeftArm,
    roomLight,
    flashlightProp,
  };
}
