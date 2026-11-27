import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HorrorAudioEngine } from './audio';
import {
  createAlumnaModel,
  createBatteryModel,
  createBedroomCutsceneSet,
  createCampanaModel,
  createChalkboardModel,
  createClassroomCutsceneSet,
  createDoorArch,
  createExitDoor,
  createFiguraModel,
  createOjoModel,
  createPrefectaModel,
  createSchoolDesk,
  createSchoolDoorArch,
  createSchoolLockerBank,
  createSideProp,
  createSombraModel,
  type AnomalyActor,
  type BatteryActor,
  type BedroomCutsceneRig,
  type ClassroomCutsceneRig,
} from './models';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import {
  ANOMALY_HINTS,
  ANOMALY_NAMES,
  getDifficultyConfig,
  type AnomalyKind,
  type DifficultyId,
  type GamePhase,
  type GraphicsQuality,
  type HudSnapshot,
  type MapId,
} from './types';

const CORRIDOR_WIDTH = 4.8;
const CORRIDOR_HALF_W = CORRIDOR_WIDTH / 2;
const CEILING_HEIGHT = 3.6;
const EXIT_Z = -176;
const PLAYER_EYE_Y = 1.62;
const PARTICLE_POOL_SIZE = 110;

interface ParticleSlot {
  active: boolean;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  scale: number;
}

// Reusable math temporaries (zero GC in loop)
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _vRight = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export class HorrorEngine {
  private container: HTMLElement;
  private onHudUpdate: (hud: HudSnapshot) => void;
  public audio: HorrorAudioEngine;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private textures!: ProceduralTextureSet;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private isSoftwareGl = false;

  // Lights & Fog
  private hemiLight!: THREE.HemisphereLight;
  private fog!: THREE.FogExp2;
  private flashlight!: THREE.SpotLight;
  private flashlightTarget!: THREE.Object3D;
  private pulseLight!: THREE.PointLight;
  private jumpscareLight!: THREE.PointLight;
  private sconceLights: { light: THREE.PointLight; baseIntensity: number; phase: number }[] = [];

  // Dynamic world & map architecture
  private mapId: MapId = 'casa';
  private difficulty: DifficultyId = 'normal';
  private graphicsQuality: GraphicsQuality = 'alta';
  private sconceDetailMultiplier = 1.0;
  private envGroup = new THREE.Group();
  private bedroomRig: BedroomCutsceneRig | null = null;
  private classroomRig: ClassroomCutsceneRig | null = null;
  private batteries: BatteryActor[] = [];
  private anomalies: AnomalyActor[] = [];
  private hitboxes: THREE.Mesh[] = [];
  private dustPoints!: THREE.Points;
  private dustMat!: THREE.PointsMaterial;
  private dustPhases!: Float32Array;
  private dustActiveCount = 380;
  private ashPoints!: THREE.Points;
  private ashPhases!: Float32Array;
  private ashActiveCount = 160;

  // Pooled burst particles
  private particleMesh!: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];

  // Raycaster & pointer
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2(0, 0);
  private aimYaw = 0;
  private aimPitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private playerX = 0;
  private playerZ = 0;
  private lateralVel = 0;
  private walkDistance = 0;
  private stepCount = 0;
  private lastStepPhase = 0;

  // Input states
  private keys: Record<string, boolean> = {};
  private steerHold = 0; // -1 left, +1 right from UI buttons
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragLastX = 0;
  private dragLastY = 0;
  private dragMovedDist = 0;
  private lastTapTime = 0;
  private sensitivity = 1.0;

  // Game state
  private phase: GamePhase = 'title';
  private paused = false;
  private battery = 100;
  private batteriesCollected = 0;
  private anomaliesDefeated = 0;
  private pulseCooldown = 0;
  private pulseFlash = 0;
  private damageFlash = 0;
  private jumpscareFlash = 0;
  private shakeStrength = 0;
  private elapsedSeconds = 0;
  private titleClock = 0;
  private introTimer = 0;
  private readonly introDuration = 3.0;
  private introFadeOpacity = 0;
  private cutsceneTimer = 0;
  private readonly cutsceneDuration = 7.6;
  private readonly schoolCutsceneDuration = 8.4;
  private cutsceneSwipeCount = 0;
  private cutsceneChairSlid = false;
  private cutsceneTeacherReplied = false;
  private cutsceneLightClicked = false;
  private cutsceneDoorOpened = false;
  private cutsceneLastStep = -1;
  private subtitleSpeaker: string | null = null;
  private subtitleText: string | null = null;
  private currentTension = 0;
  private defeatReason = '';
  private defeatedBy: AnomalyKind | null = null;
  private jumpscareTimer = 0;
  private readonly jumpscareDuration = 0.95;
  private jumpscareActor: AnomalyActor | null = null;
  private jumpscareBaseCamX = 0;
  private jumpscareBaseCamY = PLAYER_EYE_Y;
  private jumpscareBaseCamZ = 0;
  private jumpscareBaseYaw = 0;
  private jumpscareBasePitch = 0;

  // First encounter hint tracking
  private seenHints: Record<AnomalyKind, boolean> = {
    sombra: false,
    ojo: false,
    figura: false,
    prefecta: false,
    alumna: false,
    campana: false,
  };
  private currentHintKind: AnomalyKind | null = null;
  private currentHintTimer = 0;

  // Loop & timing
  private frameId = 0;
  private lastTime = 0;
  private lastHudPush = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    onHudUpdate: (hud: HudSnapshot) => void,
    initialMap: MapId = 'casa',
    initialDifficulty: DifficultyId = 'normal',
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.mapId = initialMap;
    this.difficulty = initialDifficulty;
    this.audio = new HorrorAudioEngine();

    this.initRenderer();
    this.initScene();
    this.buildCurrentMapEnvironment();
    this.initAtmosphericParticles();
    this.initParticles();
    this.populateGameplayEntities();
    this.applyGraphicsQualitySettings();
    this.bindEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.lastTime = performance.now();
    this.pushHud(true);
    this.loop();
  }

  private detectSoftwareWebGL(): boolean {
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param) || '');
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private initRenderer(): void {
    this.isSoftwareGl = this.detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.textures = createProceduralTextures(this.renderer);
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050609);
    this.fog = new THREE.FogExp2(0x050609, 0.056);
    this.scene.fog = this.fog;

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(68, w / h, 0.1, 75);
    this.camera.position.set(0, PLAYER_EYE_Y, 0);
    this.scene.add(this.camera);
    this.scene.add(this.envGroup);

    // Studio procedural environment map for realistic metallic & glossy eye reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.22;
    pmrem.dispose();

    // Cool/warm subtle atmospheric hemisphere fill (never rely on flat white ambient)
    this.hemiLight = new THREE.HemisphereLight(0x1e2c42, 0x0b0706, 0.34);
    this.scene.add(this.hemiLight);

    // Player Flashlight (SpotLight attached to camera)
    this.flashlight = new THREE.SpotLight(0xfff1d6, 9.5, 28, Math.PI / 6.2, 0.62, 1.35);
    this.flashlight.position.set(0.16, -0.14, -0.1);
    this.flashlight.castShadow = !this.isSoftwareGl;
    if (this.flashlight.castShadow) {
      this.flashlight.shadow.mapSize.set(1024, 1024);
      this.flashlight.shadow.camera.near = 0.3;
      this.flashlight.shadow.camera.far = 26;
      this.flashlight.shadow.bias = -0.0005;
    }

    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, 0, -10);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // Close bounce / pulse burst light
    this.pulseLight = new THREE.PointLight(0xd9f7ff, 0.35, 9, 1.6);
    this.pulseLight.position.set(0, -0.1, -0.4);
    this.camera.add(this.pulseLight);

    // Strobing close-range jumpscare light attached to camera
    this.jumpscareLight = new THREE.PointLight(0xff2244, 0, 5.5, 1.4);
    this.jumpscareLight.position.set(0, 0.05, -0.25);
    this.camera.add(this.jumpscareLight);

    // Raycaster only inspects layer 1 (generous anomaly hitboxes)
    this.raycaster.layers.set(1);
    this.raycaster.far = 20;
  }

  private clearMapEnvironment(): void {
    this.sconceLights = [];
    this.bedroomRig = null;
    this.classroomRig = null;
    this.envGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    this.envGroup.clear();
  }

  private buildCurrentMapEnvironment(): void {
    this.clearMapEnvironment();
    if (this.mapId === 'escuela') {
      this.buildSchoolEnvironment();
    } else {
      this.buildHouseEnvironment();
    }
    this.applyGraphicsQualitySettings();
  }

  public setMap(mapId: MapId): void {
    if (this.mapId === mapId && this.envGroup.children.length > 0) return;
    this.mapId = mapId;
    this.buildCurrentMapEnvironment();
    this.populateGameplayEntities();
    this.pushHud(true);
  }

  public setDifficulty(difficulty: DifficultyId): void {
    if (this.difficulty === difficulty) return;
    this.difficulty = difficulty;
    if (this.phase === 'title') {
      this.populateGameplayEntities();
    }
    this.pushHud(true);
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    if (this.graphicsQuality === quality) return;
    this.graphicsQuality = quality;
    this.applyGraphicsQualitySettings();
  }

  private applyGraphicsQualitySettings(): void {
    if (!this.renderer || !this.scene || !this.camera || !this.flashlight) return;
    const q = this.graphicsQuality;

    // 1. Dynamic Shadows & Pixel Ratio
    const shadowsEnabled = !this.isSoftwareGl && q !== 'baja';
    const targetShadowSize = q === 'alta' ? 1024 : 512;
    const targetPixelRatio = this.isSoftwareGl
      ? 1
      : q === 'baja'
        ? 1
        : q === 'media'
          ? Math.min(window.devicePixelRatio, 1.35)
          : Math.min(window.devicePixelRatio, 2);

    this.renderer.setPixelRatio(targetPixelRatio);
    if (this.renderer.shadowMap.enabled !== shadowsEnabled) {
      this.renderer.shadowMap.enabled = shadowsEnabled;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.flashlight.castShadow = shadowsEnabled;
    if (
      shadowsEnabled &&
      (this.flashlight.shadow.mapSize.x !== targetShadowSize ||
        this.flashlight.shadow.mapSize.y !== targetShadowSize)
    ) {
      this.flashlight.shadow.mapSize.set(targetShadowSize, targetShadowSize);
      this.flashlight.shadow.map?.dispose();
      this.flashlight.shadow.map = null;
      this.flashlight.shadow.needsUpdate = true;
    }

    // 2. Fog Density & Draw Distance
    const baseFog = this.mapId === 'escuela' ? 0.052 : 0.056;
    const fogMult = q === 'baja' ? 0.8 : q === 'media' ? 1.0 : 1.08;
    const bgHex = this.mapId === 'escuela' ? 0x040709 : 0x050609;
    if (!this.fog) {
      this.fog = new THREE.FogExp2(bgHex, baseFog * fogMult);
      this.scene.fog = this.fog;
    } else {
      this.fog.color.setHex(bgHex);
      this.fog.density = baseFog * fogMult;
    }
    this.scene.background = new THREE.Color(bgHex);

    const targetFar = q === 'baja' ? 50 : q === 'media' ? 64 : 75;
    if (this.camera.far !== targetFar) {
      this.camera.far = targetFar;
      this.camera.updateProjectionMatrix();
    }

    // 3. Dust & Ash Atmospheric Particle Density
    this.dustActiveCount = q === 'baja' ? 90 : q === 'media' ? 220 : 380;
    this.ashActiveCount = q === 'baja' ? 35 : q === 'media' ? 90 : 160;
    if (this.dustPoints) {
      this.dustPoints.geometry.setDrawRange(0, this.dustActiveCount);
    }
    if (this.ashPoints) {
      this.ashPoints.geometry.setDrawRange(0, this.ashActiveCount);
    }

    // 4. Lighting Detail
    this.scene.environmentIntensity = q === 'baja' ? 0.09 : q === 'media' ? 0.18 : 0.24;
    if (this.hemiLight) {
      this.hemiLight.intensity = q === 'baja' ? 0.42 : q === 'media' ? 0.34 : 0.32;
    }
    this.sconceDetailMultiplier = q === 'baja' ? 0.58 : q === 'media' ? 0.92 : 1.1;
  }

  private isSchoolClassroomZ(z: number): boolean {
    return (
      (z <= -34 && z >= -54) ||
      (z <= -84 && z >= -104) ||
      (z <= -134 && z >= -154)
    );
  }

  private getHalfWidthAtZ(z: number): number {
    if (this.mapId === 'escuela' && this.isSchoolClassroomZ(z)) {
      return 4.58;
    }
    return CORRIDOR_HALF_W;
  }

  private buildHouseEnvironment(): void {
    this.scene.background = new THREE.Color(0x050609);
    if (this.fog) {
      this.fog.color.setHex(0x050609);
      this.fog.density = 0.056;
    }

    const totalLen = Math.abs(EXIT_Z) + 11.4;
    const centerZ = -totalLen / 2 + 1.4;

    // Floor
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.textures.woodMap,
      roughnessMap: this.textures.woodRoughness,
      roughness: 0.85,
      metalness: 0.06,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_WIDTH + 0.2, totalLen), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, centerZ);
    floor.receiveShadow = true;
    this.envGroup.add(floor);

    // Ceiling
    const ceilMat = new THREE.MeshStandardMaterial({
      map: this.textures.ceilingMap,
      roughness: 0.92,
      metalness: 0.04,
    });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_WIDTH + 0.2, totalLen), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, CEILING_HEIGHT, centerZ);
    this.envGroup.add(ceil);

    // Walls (Left & Right)
    const wallMat = new THREE.MeshStandardMaterial({
      map: this.textures.wallpaperMap,
      roughness: 0.88,
      metalness: 0.04,
    });
    const wallGeo = new THREE.PlaneGeometry(totalLen, CEILING_HEIGHT);
    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-CORRIDOR_HALF_W, CEILING_HEIGHT / 2, centerZ);
    leftWall.receiveShadow = true;

    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(CORRIDOR_HALF_W, CEILING_HEIGHT / 2, centerZ);
    rightWall.receiveShadow = true;
    this.envGroup.add(leftWall, rightWall);

    // Poppy-Playtime-inspired industrial hazard wainscoting strip along walls
    const hazardMat = new THREE.MeshStandardMaterial({
      map: this.textures.hazardMap,
      roughness: 0.72,
      metalness: 0.18,
    });
    const trimGeo = new THREE.BoxGeometry(0.06, 0.24, totalLen);
    const trimL = new THREE.Mesh(trimGeo, hazardMat);
    trimL.position.set(-CORRIDOR_HALF_W + 0.03, 0.92, centerZ);
    const trimR = new THREE.Mesh(trimGeo, hazardMat);
    trimR.position.set(CORRIDOR_HALF_W - 0.03, 0.92, centerZ);
    this.envGroup.add(trimL, trimR);

    // Overhead industrial conduit pipe
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x26292e,
      metalness: 0.82,
      roughness: 0.35,
    });
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, totalLen, 10),
      pipeMat,
    );
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(-1.75, CEILING_HEIGHT - 0.18, centerZ);
    this.envGroup.add(pipe);

    // Bedroom set behind z = 1.4 for La Casa intro cutscene (guy in bed -> hallway)
    this.bedroomRig = createBedroomCutsceneSet(this.textures, CORRIDOR_WIDTH, CEILING_HEIGHT);
    this.bedroomRig.guyGroup.visible = false;
    this.bedroomRig.phoneLight.intensity = 0;
    this.bedroomRig.lampLight.intensity = 0;
    this.bedroomRig.doorPivot.rotation.y = 1.35;
    this.envGroup.add(this.bedroomRig.root);

    // Entrance threshold frame visible right past the bedroom door
    this.envGroup.add(createDoorArch(-2.0, CORRIDOR_WIDTH, CEILING_HEIGHT, false));

    // Door arches & ceiling rafters along corridor
    for (let z = -12; z >= EXIT_Z + 10; z -= 14) {
      const isRoom = Math.abs(z) % 28 === 12;
      const arch = createDoorArch(z, CORRIDOR_WIDTH, CEILING_HEIGHT, isRoom);
      this.envGroup.add(arch);
    }

    // Side haunted house & toy-factory props
    const propTypes: ('crates' | 'blocks' | 'cabinet')[] = ['blocks', 'crates', 'cabinet'];
    for (let i = 0; i < 16; i++) {
      const pz = -9 - i * 10.2;
      const side = i % 2 === 0 ? -1 : 1;
      const px = side * (CORRIDOR_HALF_W - 0.56);
      const prop = createSideProp(propTypes[i % propTypes.length], px, pz, this.textures);
      this.envGroup.add(prop);
    }

    // Sparse eerie flickering wall sconces (4 point lights total for mobile/Quest FPS)
    const sconceZs = [-11, -56, -108, -158];
    const sconceColors = [0xff6b2b, 0x22d3ee, 0xe11d48, 0x10b981];
    sconceZs.forEach((sz, idx) => {
      const side = idx % 2 === 0 ? -1 : 1;
      const sx = side * (CORRIDOR_HALF_W - 0.18);

      const cage = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.14, 0.24, 8),
        new THREE.MeshStandardMaterial({
          color: sconceColors[idx],
          emissive: sconceColors[idx],
          emissiveIntensity: 1.8,
          roughness: 0.3,
        }),
      );
      cage.position.set(sx, 2.35, sz);
      this.envGroup.add(cage);

      const light = new THREE.PointLight(sconceColors[idx], 2.2, 13, 1.8);
      light.position.set(sx - side * 0.28, 2.35, sz);
      this.envGroup.add(light);
      this.sconceLights.push({ light, baseIntensity: 2.2, phase: idx * 1.9 });
    });

    // Exit door ("SALIDA") at end of house
    const exitDoor = createExitDoor(EXIT_Z, this.textures);
    this.envGroup.add(exitDoor);
  }

  private buildSchoolEnvironment(): void {
    this.scene.background = new THREE.Color(0x040709);
    if (this.fog) {
      this.fog.color.setHex(0x040709);
      this.fog.density = 0.052;
    }

    const totalLen = Math.abs(EXIT_Z) + 11.4;
    const centerZ = -totalLen / 2 + 1.4;
    const classroomHalfW = 4.6;
    const fullWidth = classroomHalfW * 2;

    // Continuous worn school linoleum floor & dropped acoustic tile ceiling
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.textures.linoleumMap,
      roughnessMap: this.textures.linoleumRoughness,
      roughness: 0.72,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fullWidth, totalLen), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, centerZ);
    floor.receiveShadow = true;
    this.envGroup.add(floor);

    const ceilMat = new THREE.MeshStandardMaterial({
      map: this.textures.acousticCeilingMap,
      roughness: 0.94,
      metalness: 0.04,
    });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(fullWidth, totalLen), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, CEILING_HEIGHT, centerZ);
    this.envGroup.add(ceil);

    const wallMat = new THREE.MeshStandardMaterial({
      map: this.textures.schoolWallMap,
      roughness: 0.82,
      metalness: 0.06,
    });

    // Hallway wall segments (narrow corridor between dark classrooms)
    const hallSegments: [number, number][] = [
      [1.4, -34],
      [-54, -84],
      [-104, -134],
      [-154, EXIT_Z - 10],
    ];
    for (const [zStart, zEnd] of hallSegments) {
      const segLen = Math.abs(zStart - zEnd);
      const segCenter = (zStart + zEnd) / 2;
      const segGeo = new THREE.PlaneGeometry(segLen, CEILING_HEIGHT);

      const lw = new THREE.Mesh(segGeo, wallMat);
      lw.rotation.y = Math.PI / 2;
      lw.position.set(-CORRIDOR_HALF_W, CEILING_HEIGHT / 2, segCenter);
      lw.receiveShadow = true;

      const rw = new THREE.Mesh(segGeo, wallMat);
      rw.rotation.y = -Math.PI / 2;
      rw.position.set(CORRIDOR_HALF_W, CEILING_HEIGHT / 2, segCenter);
      rw.receiveShadow = true;

      this.envGroup.add(lw, rw);
    }

    // Starting classroom behind z = 1.4 for La Escuela intro cutscene
    this.classroomRig = createClassroomCutsceneSet(this.textures, CORRIDOR_WIDTH, CEILING_HEIGHT);
    this.classroomRig.roomLight.intensity = 0;
    this.classroomRig.doorPivot.rotation.y = 1.35;
    this.envGroup.add(this.classroomRig.root);

    // School entrance frame visible right past classroom door
    this.envGroup.add(createSchoolDoorArch(-2.0, CORRIDOR_WIDTH, CEILING_HEIGHT, false));

    // 3 Dark Classrooms expanding wide to left and right with desks & chalkboards
    const classrooms: [number, number][] = [
      [-34, -54],
      [-84, -104],
      [-134, -154],
    ];
    const wingW = classroomHalfW - CORRIDOR_HALF_W; // 2.2m side wing depth
    const wingGeo = new THREE.PlaneGeometry(wingW, CEILING_HEIGHT);

    classrooms.forEach(([cStart, cEnd], cIdx) => {
      const cLen = Math.abs(cStart - cEnd);
      const cCenter = (cStart + cEnd) / 2;
      const sideGeo = new THREE.PlaneGeometry(cLen, CEILING_HEIGHT);

      // Outer classroom walls
      const leftOuter = new THREE.Mesh(sideGeo, wallMat);
      leftOuter.rotation.y = Math.PI / 2;
      leftOuter.position.set(-classroomHalfW, CEILING_HEIGHT / 2, cCenter);
      const rightOuter = new THREE.Mesh(sideGeo, wallMat);
      rightOuter.rotation.y = -Math.PI / 2;
      rightOuter.position.set(classroomHalfW, CEILING_HEIGHT / 2, cCenter);
      this.envGroup.add(leftOuter, rightOuter);

      // Front & rear classroom bulkhead return walls connecting hallway to classroom wings
      [-1, 1].forEach((side) => {
        const bx = side * (CORRIDOR_HALF_W + wingW / 2);
        const nearBulkhead = new THREE.Mesh(wingGeo, wallMat);
        nearBulkhead.rotation.y = Math.PI;
        nearBulkhead.position.set(bx, CEILING_HEIGHT / 2, cStart);

        const farBulkhead = new THREE.Mesh(wingGeo, wallMat);
        farBulkhead.position.set(bx, CEILING_HEIGHT / 2, cEnd);

        this.envGroup.add(nearBulkhead, farBulkhead);
      });

      // Large chalkboard on the far front wall of each classroom (facing player) + side board
      const frontBoardX = cIdx % 2 === 0 ? -3.45 : 3.45;
      this.envGroup.add(
        createChalkboardModel(frontBoardX, 1.75, cEnd + 0.08, 0, this.textures),
      );
      const sideBoardX = cIdx % 2 === 0 ? classroomHalfW - 0.06 : -classroomHalfW + 0.06;
      const sideBoardRot = cIdx % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
      this.envGroup.add(
        createChalkboardModel(sideBoardX, 1.75, cCenter, sideBoardRot, this.textures),
      );

      // Rows of student desks in both dark classroom wings (leaving center path clear)
      for (let r = 0; r < 4; r++) {
        const dz = cStart - 3.6 - r * 3.8;
        [-3.85, -2.55, 2.55, 3.85].forEach((dx, colIdx) => {
          const skew = ((r + colIdx + cIdx) % 5 === 0) ? (colIdx % 2 === 0 ? 0.34 : -0.28) : 0;
          this.envGroup.add(createSchoolDesk(dx, dz, this.textures, skew));
        });
      }
    });

    // Metal Locker Banks lining the school hallways
    const lockerZs = [-8, -16, -24, -60, -70, -78, -110, -120, -128, -160, -168];
    lockerZs.forEach((lz, idx) => {
      const ajarL = idx % 3 === 0 ? 1 : -1;
      const ajarR = idx % 4 === 1 ? 2 : -1;
      this.envGroup.add(
        createSchoolLockerBank(-CORRIDOR_HALF_W + 0.24, lz, -1, this.textures, ajarL),
        createSchoolLockerBank(CORRIDOR_HALF_W - 0.24, lz, 1, this.textures, ajarR),
      );
    });

    // Institutional school door arches at classroom entries & mid-hallways
    const archZs = [-20, -34, -54, -69, -84, -104, -119, -134, -154];
    archZs.forEach((az) => {
      const isEntry = az === -34 || az === -54 || az === -84 || az === -104 || az === -134 || az === -154;
      this.envGroup.add(createSchoolDoorArch(az, CORRIDOR_WIDTH, CEILING_HEIGHT, isEntry));
    });

    // Flickering cold fluorescent light fixtures (4 point lights matching GPU budget)
    const fluorZs = [-14, -44, -94, -144];
    const fluorColors = [0x99f6e4, 0x7dd3fc, 0xfef08a, 0x6ee7b7];
    fluorZs.forEach((fz, idx) => {
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 0.08, 0.28),
        new THREE.MeshStandardMaterial({
          color: fluorColors[idx],
          emissive: fluorColors[idx],
          emissiveIntensity: 1.5,
          roughness: 0.25,
        }),
      );
      housing.position.set(0, CEILING_HEIGHT - 0.05, fz);
      this.envGroup.add(housing);

      const light = new THREE.PointLight(fluorColors[idx], 2.4, 15, 1.7);
      light.position.set(0, CEILING_HEIGHT - 0.35, fz);
      this.envGroup.add(light);
      this.sconceLights.push({ light, baseIntensity: 2.4, phase: idx * 2.3 });
    });

    // Exit door ("SALIDA") at end of school hallway
    const exitDoor = createExitDoor(EXIT_Z, this.textures);
    this.envGroup.add(exitDoor);
  }

  private initAtmosphericParticles(): void {
    // Atmospheric Layer 1: Fine suspended dust motes catching the flashlight beam
    const dustCount = 380;
    const dustPos = new Float32Array(dustCount * 3);
    this.dustPhases = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * (CORRIDOR_WIDTH - 0.35);
      dustPos[i * 3 + 1] = 0.2 + Math.random() * (CEILING_HEIGHT - 0.35);
      dustPos[i * 3 + 2] = 2 - Math.random() * 26;
      this.dustPhases[i] = Math.random() * Math.PI * 2;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dustMat = new THREE.PointsMaterial({
      map: this.textures.glowMap,
      color: 0xe2dfd5,
      size: 0.065,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dustPoints = new THREE.Points(dustGeo, this.dustMat);
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);

    // Atmospheric Layer 2: Slowly falling dark-grey ash flakes
    const ashCount = 160;
    const ashPos = new Float32Array(ashCount * 3);
    this.ashPhases = new Float32Array(ashCount);
    for (let i = 0; i < ashCount; i++) {
      ashPos[i * 3] = (Math.random() - 0.5) * (CORRIDOR_WIDTH - 0.45);
      ashPos[i * 3 + 1] = 0.15 + Math.random() * (CEILING_HEIGHT - 0.3);
      ashPos[i * 3 + 2] = 2 - Math.random() * 26;
      this.ashPhases[i] = Math.random() * Math.PI * 2;
    }
    const ashGeo = new THREE.BufferGeometry();
    ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
    const ashMat = new THREE.PointsMaterial({
      map: this.textures.ashMap,
      color: 0xb8b2a8,
      size: 0.105,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });
    this.ashPoints = new THREE.Points(ashGeo, ashMat);
    this.ashPoints.frustumCulled = false;
    this.scene.add(this.ashPoints);
  }

  private initParticles(): void {
    const geo = new THREE.OctahedronGeometry(0.065, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(geo, mat, PARTICLE_POOL_SIZE);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        life: 0,
        maxLife: 1,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 0,
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  private spawnBurst(x: number, y: number, z: number, hexColor: number, count: number): void {
    let spawned = 0;
    for (let i = 0; i < PARTICLE_POOL_SIZE && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.life = 0;
        p.maxLife = 0.45 + Math.random() * 0.45;
        p.x = x + (Math.random() - 0.5) * 0.35;
        p.y = y + (Math.random() - 0.5) * 0.45;
        p.z = z + (Math.random() - 0.5) * 0.35;
        p.vx = (Math.random() - 0.5) * 4.5;
        p.vy = 0.8 + Math.random() * 3.2;
        p.vz = (Math.random() - 0.5) * 4.5;
        p.scale = 0.7 + Math.random() * 0.9;
        _color.setHex(hexColor);
        this.particleMesh.setColorAt(i, _color);
        spawned++;
      }
    }
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private clearGameplayEntities(): void {
    for (const b of this.batteries) {
      this.scene.remove(b.group);
    }
    for (const a of this.anomalies) {
      this.scene.remove(a.group);
    }
    this.batteries = [];
    this.anomalies = [];
    this.hitboxes = [];
  }

  private populateGameplayEntities(): void {
    this.clearGameplayEntities();
    const cfg = getDifficultyConfig(this.difficulty);

    // Glowing batteries scaled by difficulty and scattered across varied lanes
    const laneChoices = [-1.28, -0.65, 0.0, 0.65, 1.28];
    const batStep = (165 - 12) / Math.max(1, cfg.batteryCount - 1);
    for (let idx = 0; idx < cfg.batteryCount; idx++) {
      const bz = -12 - idx * batStep;
      const jitterZ = bz + (Math.random() - 0.5) * 2.8;
      const laneX =
        idx === 0
          ? 0
          : laneChoices[Math.floor(Math.random() * laneChoices.length)] +
            (Math.random() - 0.5) * 0.25;
      const clampedX = THREE.MathUtils.clamp(laneX, -1.45, 1.45);
      const bat = createBatteryModel(idx, clampedX, jitterZ, this.textures);
      this.scene.add(bat.group);
      this.batteries.push(bat);
    }

    // Architectural zones across the map scaled by difficulty anomaly count
    const zoneContexts: ('doorway' | 'corner' | 'room' | 'hallway')[] = [
      'hallway',
      'doorway',
      'corner',
      'doorway',
      'room',
    ];
    const zoneSlots: {
      baseZ: number;
      context: 'doorway' | 'corner' | 'room' | 'hallway';
    }[] = [];
    const anomStep = (168 - 21) / Math.max(1, cfg.anomalyCount - 1);
    for (let i = 0; i < cfg.anomalyCount; i++) {
      zoneSlots.push({
        baseZ: -21 - i * anomStep,
        context: zoneContexts[i % zoneContexts.length],
      });
    }

    // Distinct monster roster per map
    const mapRoster: AnomalyKind[] =
      this.mapId === 'escuela'
        ? ['prefecta', 'alumna', 'campana']
        : ['sombra', 'ojo', 'figura'];

    // Shuffle first 3 anomalies so the player encounters all 3 types early in unpredictable order
    const introOrder: AnomalyKind[] = [...mapRoster];
    for (let i = introOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = introOrder[i];
      introOrder[i] = introOrder[j];
      introOrder[j] = tmp;
    }

    const pool: AnomalyKind[] = [];
    while (introOrder.length + pool.length < cfg.anomalyCount) {
      pool.push(mapRoster[pool.length % mapRoster.length]);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    const fullSequence: AnomalyKind[] = [...introOrder, ...pool];
    const wallMounts: ('left' | 'right' | 'ceiling')[] = ['left', 'right', 'ceiling'];
    let lastPlacedZ = -8;
    const minSep = cfg.anomalyCount >= 14 ? 9.5 : 11.0;

    fullSequence.forEach((kind, idx) => {
      const slot = zoneSlots[idx];
      const jitter =
        slot.context === 'doorway' ? (Math.random() - 0.5) * 1.4 : (Math.random() - 0.5) * 3.2;
      const z = Math.min(lastPlacedZ - minSep, slot.baseZ + jitter);
      lastPlacedZ = z;

      let actor: AnomalyActor;
      if (kind === 'sombra') {
        let sx = 0;
        if (slot.context === 'corner') {
          sx = (Math.random() > 0.5 ? 1 : -1) * (1.15 + Math.random() * 0.35);
        } else if (slot.context === 'doorway') {
          sx = (Math.random() > 0.5 ? 1 : -1) * (0.65 + Math.random() * 0.55);
        } else {
          sx = (Math.random() - 0.5) * 1.4;
        }
        actor = createSombraModel(idx, sx, z, this.textures);
      } else if (kind === 'ojo') {
        const wallHalfW = this.getHalfWidthAtZ(z);
        const mount = wallMounts[Math.floor(Math.random() * wallMounts.length)];
        const offsetCoord =
          mount === 'ceiling'
            ? (Math.random() - 0.5) * 2.7
            : slot.context === 'doorway'
              ? 2.25 + Math.random() * 0.45
              : 1.55 + Math.random() * 0.95;
        actor = createOjoModel(
          idx,
          mount,
          z,
          this.textures,
          wallHalfW,
          CEILING_HEIGHT,
          offsetCoord,
        );
      } else if (kind === 'figura') {
        let fx = 0;
        if (slot.context === 'corner') {
          fx = (Math.random() > 0.5 ? 1 : -1) * (1.1 + Math.random() * 0.4);
        } else if (slot.context === 'doorway') {
          fx = (Math.random() - 0.5) * 1.8;
        } else {
          fx = (Math.random() - 0.5) * 2.4;
        }
        actor = createFiguraModel(idx, fx, z, this.textures);
        actor.creepSpeed = (1.38 + Math.random() * 0.48) * cfg.creepMultiplier;
      } else if (kind === 'prefecta') {
        // Place along one lane so player can steer to the opposite side and avert beam
        const side = Math.random() > 0.5 ? 1 : -1;
        const px =
          this.isSchoolClassroomZ(z)
            ? side * (1.15 + Math.random() * 0.75)
            : side * (0.88 + Math.random() * 0.42);
        actor = createPrefectaModel(idx, px, z, this.textures);
        actor.creepSpeed = (1.42 + Math.random() * 0.35) * cfg.creepMultiplier;
      } else if (kind === 'alumna') {
        const ax = this.isSchoolClassroomZ(z)
          ? (Math.random() - 0.5) * 2.8
          : (Math.random() - 0.5) * 2.1;
        actor = createAlumnaModel(idx, ax, z, this.textures);
        actor.creepSpeed = (1.32 + Math.random() * 0.42) * cfg.creepMultiplier;
      } else {
        const wallHalfW = this.getHalfWidthAtZ(z);
        const mount = wallMounts[Math.floor(Math.random() * wallMounts.length)];
        const offsetCoord =
          mount === 'ceiling'
            ? (Math.random() - 0.5) * (wallHalfW > 3 ? 4.2 : 2.6)
            : 2.25 + Math.random() * 0.55;
        actor = createCampanaModel(
          idx,
          mount,
          z,
          this.textures,
          wallHalfW,
          CEILING_HEIGHT,
          offsetCoord,
        );
      }

      this.scene.add(actor.group);
      this.anomalies.push(actor);
      this.hitboxes.push(actor.hitbox);
    });
  }

  public startGame(): void {
    this.audio.unlock();
    this.audio.playFlashlightClick();

    this.paused = false;
    this.populateGameplayEntities();
    this.battery = 100;
    this.batteriesCollected = 0;
    this.anomaliesDefeated = 0;
    this.pulseCooldown = 0;
    this.pulseFlash = 0;
    this.damageFlash = 0;
    this.jumpscareFlash = 0;
    this.shakeStrength = 0;
    this.elapsedSeconds = 0;
    this.currentTension = 0;
    this.defeatReason = '';
    this.defeatedBy = null;
    this.jumpscareActor = null;
    this.jumpscareTimer = 0;
    this.jumpscareLight.intensity = 0;
    this.playerX = 0;
    this.playerZ = 0;
    this.lateralVel = 0;
    this.walkDistance = 0;
    this.stepCount = 0;
    this.lastStepPhase = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.seenHints = {
      sombra: false,
      ojo: false,
      figura: false,
      prefecta: false,
      alumna: false,
      campana: false,
    };
    this.currentHintKind = null;
    this.currentHintTimer = 0;
    this.subtitleSpeaker = null;
    this.subtitleText = null;
    this.hudTargetKind = null;
    this.hudTargetSubLabel = '';
    this.hudTargetCharge = 0;

    if (this.mapId === 'casa' && this.bedroomRig) {
      // Start La Casa bedroom TikTok cutscene
      this.phase = 'cutscene';
      this.cutsceneTimer = 0;
      this.introFadeOpacity = 1;
      this.cutsceneSwipeCount = 0;
      this.cutsceneChairSlid = false;
      this.cutsceneTeacherReplied = false;
      this.cutsceneLightClicked = false;
      this.cutsceneDoorOpened = false;
      this.cutsceneLastStep = -1;

      const rig = this.bedroomRig;
      rig.doorPivot.rotation.y = 0;
      rig.guyGroup.visible = true;
      rig.guyGroup.position.set(1.2, 0.72, 6.02);
      rig.guyGroup.rotation.set(0, 0, 0);
      rig.guyTorsoPivot.rotation.set(-1.12, 0, 0);
      rig.guyHead.rotation.set(0.32, 0, 0);
      rig.guyLegsPivot.rotation.set(-1.42, 0, 0);
      rig.guyRightArm.rotation.set(-0.95, 0.2, 0.15);
      rig.guyLeftArm.rotation.set(-0.35, 0, -0.1);
      rig.phoneGroup.visible = true;
      rig.phoneLight.intensity = 1.25;
      rig.lampLight.intensity = 1.35;
      rig.flashlightProp.visible = true;

      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
      this.camera.position.set(-0.42, 1.54, 4.45);
      this.camera.lookAt(0.92, 0.96, 5.82);
      this.flashlight.intensity = 0;
      this.pulseLight.intensity = 0;
    } else if (this.mapId === 'escuela' && this.classroomRig) {
      // Start La Escuela classroom desk cutscene
      this.phase = 'cutscene';
      this.cutsceneTimer = 0;
      this.introFadeOpacity = 1;
      this.cutsceneSwipeCount = 0;
      this.cutsceneChairSlid = false;
      this.cutsceneTeacherReplied = false;
      this.cutsceneLightClicked = false;
      this.cutsceneDoorOpened = false;
      this.cutsceneLastStep = -1;

      const rig = this.classroomRig;
      rig.doorPivot.rotation.y = 0;
      rig.teacherHead.rotation.set(0, 0, 0);
      rig.teacherRightArm.rotation.set(0, 0, 0);
      rig.teacherLeftArm.rotation.set(0, 0, 0);
      rig.roomLight.intensity = 2.0;
      rig.flashlightProp.visible = true;

      this.camera.fov = 64;
      this.camera.updateProjectionMatrix();
      // Seated at student desk (-1.25, 5.05) looking forward (+Z) at teacher & chalkboard
      this.camera.position.set(-1.25, 1.12, 5.05);
      this.camera.lookAt(-0.45, 1.54, 8.2);
      this.flashlight.intensity = 0;
      this.pulseLight.intensity = 0;
    } else {
      // Fallback 3-second fade-in entrance pan
      this.audio.playIntroSwell();
      this.phase = 'intro';
      this.introTimer = 0;
      this.introFadeOpacity = 1;
      this.camera.fov = 64;
      this.camera.updateProjectionMatrix();
      this.camera.position.set(-1.18, 1.42, 2.85);
      this.camera.rotation.set(-0.08, -0.34, 0.025);
      this.flashlight.intensity = 0;
    }

    this.pushHud(true);
  }

  public skipCutscene(): void {
    if (this.phase !== 'cutscene') return;
    this.audio.unlock();
    this.audio.playFlashlightClick();
    if (this.bedroomRig) {
      this.bedroomRig.guyGroup.visible = false;
      this.bedroomRig.phoneLight.intensity = 0;
      this.bedroomRig.lampLight.intensity = 0;
      this.bedroomRig.flashlightProp.visible = false;
      this.bedroomRig.doorPivot.rotation.y = 1.42;
    }
    if (this.classroomRig) {
      this.classroomRig.roomLight.intensity = 0;
      this.classroomRig.flashlightProp.visible = false;
      this.classroomRig.doorPivot.rotation.y = 1.42;
    }
    this.subtitleSpeaker = null;
    this.subtitleText = null;
    this.introFadeOpacity = 0;
    this.camera.position.set(0, PLAYER_EYE_Y, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
    this.lastStepPhase = 0;
    this.phase = 'playing';
    this.pushHud(true);
  }

  public returnToTitle(): void {
    this.audio.unlock();
    this.audio.playFlashlightClick();
    this.paused = false;
    this.lateralVel = 0;
    this.keys = {};
    this.steerHold = 0;
    this.isDragging = false;
    this.populateGameplayEntities();
    this.phase = 'title';
    this.introTimer = 0;
    this.introFadeOpacity = 0;
    this.cutsceneTimer = 0;
    this.subtitleSpeaker = null;
    this.subtitleText = null;
    if (this.bedroomRig) {
      this.bedroomRig.guyGroup.visible = false;
      this.bedroomRig.phoneLight.intensity = 0;
      this.bedroomRig.lampLight.intensity = 0;
      this.bedroomRig.doorPivot.rotation.y = 1.35;
    }
    if (this.classroomRig) {
      this.classroomRig.roomLight.intensity = 0;
      this.classroomRig.doorPivot.rotation.y = 1.35;
    }
    this.battery = 100;
    this.pulseCooldown = 0;
    this.pulseFlash = 0;
    this.damageFlash = 0;
    this.jumpscareFlash = 0;
    this.shakeStrength = 0;
    this.currentTension = 0;
    this.defeatReason = '';
    this.defeatedBy = null;
    this.jumpscareActor = null;
    this.jumpscareTimer = 0;
    this.jumpscareLight.intensity = 0;
    this.currentHintKind = null;
    this.currentHintTimer = 0;
    this.hudTargetKind = null;
    this.hudTargetSubLabel = '';
    this.hudTargetCharge = 0;
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
    this.pushHud(true);
  }

  public setPaused(paused: boolean): void {
    if (this.phase !== 'playing' && this.phase !== 'cutscene' && this.phase !== 'intro') {
      this.paused = false;
      return;
    }
    this.paused = paused;
    if (paused) {
      this.keys = {};
      this.steerHold = 0;
      this.isDragging = false;
      this.lateralVel = 0;
    }
    this.pushHud(true);
  }

  public setSteerHold(dir: -1 | 0 | 1): void {
    this.steerHold = dir;
  }

  public setSensitivity(value: number): void {
    this.sensitivity = THREE.MathUtils.clamp(value, 0.4, 2.0);
  }

  public triggerFlashlightPulse(): void {
    if (this.phase !== 'playing' || this.pulseCooldown > 0 || this.battery <= 1) return;

    this.audio.unlock();
    this.audio.playPulse();

    this.pulseCooldown = 0.72;
    this.pulseFlash = 1.0;
    this.shakeStrength = Math.max(this.shakeStrength, 0.045);
    this.battery = Math.max(0, this.battery - 5.5);

    // Check any Ojo Vigilante or Campana Maldita inside the flashlight cone
    this.camera.getWorldPosition(_vA);
    this.flashlightTarget.getWorldPosition(_vB);
    _vDir.copy(_vB).sub(_vA).normalize();

    for (const a of this.anomalies) {
      if (a.defeated || (a.kind !== 'ojo' && a.kind !== 'campana')) continue;
      a.group.getWorldPosition(_vB);
      const dist = _vA.distanceTo(_vB);
      if (dist < 17) {
        _vB.sub(_vA).normalize();
        const dot = _vDir.dot(_vB);
        if (dot > 0.89) {
          this.defeatAnomaly(a);
        }
      }
    }
    this.pushHud(true);
  }

  private defeatAnomaly(a: AnomalyActor): void {
    if (a.defeated) return;
    a.defeated = true;
    a.group.visible = false;
    this.anomaliesDefeated++;
    this.shakeStrength = Math.max(this.shakeStrength, 0.06);

    const burstColor =
      a.kind === 'sombra'
        ? 0xc084fc
        : a.kind === 'ojo'
          ? 0xff334b
          : a.kind === 'figura'
            ? 0xf5b800
            : a.kind === 'prefecta'
              ? 0xfb7185
              : a.kind === 'alumna'
                ? 0x67e8f9
                : 0xff2b3d;
    const burstY = a.kind === 'ojo' || a.kind === 'campana' ? a.baseY : 1.35;
    this.spawnBurst(a.group.position.x, burstY, a.group.position.z, burstColor, 26);
    this.audio.playAnomalyDefeated(a.kind);

    if (this.currentHintKind === a.kind) {
      this.currentHintKind = null;
      this.currentHintTimer = 0;
    }
    this.pushHud(true);
  }

  private handlePointerInteraction(clientX: number, clientY: number): void {
    if (this.phase !== 'playing') return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitboxes, false);

    if (hits.length > 0) {
      const anomalyId = hits[0].object.userData.anomalyId as number;
      const actor = this.anomalies.find((a) => a.id === anomalyId);
      if (actor && !actor.defeated) {
        if (actor.kind === 'figura') {
          const lit = this.isAnomalyInBeam(actor, 0.84, 18);
          if (lit) {
            this.defeatAnomaly(actor);
            return;
          }
        } else if (actor.kind === 'alumna') {
          // Needs 3 rapid hits while illuminated to shatter chalk armor
          const lit = this.isAnomalyInBeam(actor, 0.84, 18);
          if (lit) {
            const rem = (actor.hitsRemaining ?? 3) - 1;
            actor.hitsRemaining = rem;
            if (rem <= 0) {
              this.defeatAnomaly(actor);
            } else {
              this.audio.playAlumnaHit(rem);
              this.shakeStrength = Math.max(this.shakeStrength, 0.045);
              this.spawnBurst(actor.group.position.x, 1.3, actor.group.position.z, 0x67e8f9, 14);
              actor.group.position.z -= 1.05;
              this.pushHud(true);
            }
            return;
          }
        } else if (actor.kind === 'ojo' || actor.kind === 'campana') {
          this.triggerFlashlightPulse();
          return;
        }
      }
    }
  }

  private isAnomalyInBeam(a: AnomalyActor, minDot: number, maxDist: number): boolean {
    this.camera.getWorldPosition(_vA);
    this.flashlightTarget.getWorldPosition(_vB);
    _vDir.copy(_vB).sub(_vA).normalize();

    const targetY = a.kind === 'ojo' || a.kind === 'campana' ? a.baseY : 1.3;
    _vB.set(a.group.position.x, targetY, a.group.position.z);
    const dist = _vA.distanceTo(_vB);
    if (dist > maxDist) return false;
    _vB.sub(_vA).normalize();
    return _vDir.dot(_vB) >= minDot;
  }

  private bindEvents(): void {
    const canvas = this.renderer.domElement;

    const onResize = () => {
      if (this.disposed) return;
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.paused) return;
      this.keys[e.code] = true;
      if (
        this.phase === 'playing' &&
        (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space')
      ) {
        e.preventDefault();
      }
      if (this.phase === 'playing' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        this.triggerFlashlightPulse();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };

    const onBlur = () => {
      this.keys = {};
      this.steerHold = 0;
      this.isDragging = false;
      this.lateralVel = 0;
    };

    const onPointerDown = (e: PointerEvent) => {
      this.audio.unlock();
      if (this.phase !== 'playing' || this.paused) return;

      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragLastX = e.clientX;
      this.dragLastY = e.clientY;
      this.dragMovedDist = 0;

      // On mouse or Meta Quest pointer, clicking directly interacts immediately
      if (e.pointerType !== 'touch') {
        this.handlePointerInteraction(e.clientX, e.clientY);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.phase !== 'playing' || this.paused) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      if (e.pointerType === 'touch') {
        if (!this.isDragging) return;
        const dx = e.clientX - this.dragLastX;
        const dy = e.clientY - this.dragLastY;
        this.dragLastX = e.clientX;
        this.dragLastY = e.clientY;
        this.dragMovedDist += Math.hypot(dx, dy);

        // Smooth touch drag aims flashlight & steers gently
        this.targetYaw = THREE.MathUtils.clamp(
          this.targetYaw - (dx / rect.width) * 1.45 * this.sensitivity,
          -0.82,
          0.82,
        );
        this.targetPitch = THREE.MathUtils.clamp(
          this.targetPitch - (dy / rect.height) * 1.15 * this.sensitivity,
          -0.54,
          0.54,
        );
      } else {
        // Mouse & Meta Quest Browser laser pointer: smooth reticle-guided aiming!
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        this.targetYaw = THREE.MathUtils.clamp(-nx * 0.56 * this.sensitivity, -0.82, 0.82);
        this.targetPitch = THREE.MathUtils.clamp(-ny * 0.38 * this.sensitivity, -0.54, 0.54);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && this.isDragging && this.phase === 'playing') {
        if (this.dragMovedDist < 16) {
          // Clean tap on touchscreen!
          const now = performance.now();
          this.handlePointerInteraction(e.clientX, e.clientY);
          // Double-tap also fires Flashlight Pulse
          if (now - this.lastTapTime < 290) {
            this.triggerFlashlightPulse();
          }
          this.lastTapTime = now;
        }
      }
      this.isDragging = false;
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    this.cleanupListeners = () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }

  private cleanupListeners: () => void = () => {};

  private triggerJumpscare(actor: AnomalyActor, reason: string): void {
    if (this.phase !== 'playing') return;
    this.phase = 'jumpscare';
    this.defeatedBy = actor.kind;
    this.defeatReason = reason;
    this.jumpscareActor = actor;
    this.jumpscareTimer = 0;
    this.jumpscareFlash = 1.0;
    this.damageFlash = 1.0;
    this.currentHintKind = null;
    this.currentHintTimer = 0;
    this.hudTargetKind = null;
    this.hudTargetCharge = 0;

    this.jumpscareBaseCamX = this.playerX;
    this.jumpscareBaseCamY = PLAYER_EYE_Y;
    this.jumpscareBaseCamZ = this.playerZ;
    this.jumpscareBaseYaw = this.aimYaw;
    this.jumpscareBasePitch = this.aimPitch;

    actor.group.visible = true;
    actor.materials.forEach((m) => {
      m.opacity = 1;
    });

    this.audio.playJumpscare(actor.kind);
    this.pushHud(true);
  }

  private triggerDefeat(reason: string): void {
    if (this.phase !== 'playing') return;
    this.phase = 'defeat';
    this.defeatedBy = null;
    this.defeatReason = reason;
    this.damageFlash = 1.0;
    this.audio.playDefeat();
    this.pushHud(true);
  }

  private triggerVictory(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'victory';
    this.audio.playVictory();
    this.pushHud(true);
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0);
      } else {
        p.vy -= 6.8 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const s = p.scale * (1 - p.life / p.maxLife);
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.rotation.set(p.life * 7, p.life * 5, 0);
        _dummy.scale.setScalar(Math.max(0.001, s));
      }
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateAtmosphericParticles(dt: number, elapsed: number): void {
    const camZ = this.camera.position.z;
    const zMin = camZ - 23;
    const zMax = camZ + 3;
    const zSpan = 26;
    const halfW = CORRIDOR_HALF_W - 0.25;

    // Modulate dust shimmer with flashlight beam power
    if (this.dustMat) {
      const beamFactor = Math.min(1.4, this.flashlight.intensity / 11);
      this.dustMat.opacity = 0.2 + beamFactor * 0.24;
    }

    if (this.dustPoints) {
      const attr = this.dustPoints.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const count = Math.min(this.dustActiveCount, this.dustPhases.length);
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const ph = this.dustPhases[i];
        arr[idx] += Math.sin(elapsed * 0.65 + ph) * 0.14 * dt;
        arr[idx + 1] += (Math.cos(elapsed * 0.48 + ph * 1.3) * 0.09 - 0.03) * dt;
        arr[idx + 2] += Math.sin(elapsed * 0.4 + ph * 0.7) * 0.1 * dt;

        if (arr[idx] > halfW) arr[idx] = -halfW;
        else if (arr[idx] < -halfW) arr[idx] = halfW;

        if (arr[idx + 1] < 0.15) arr[idx + 1] = CEILING_HEIGHT - 0.25;
        else if (arr[idx + 1] > CEILING_HEIGHT - 0.2) arr[idx + 1] = 0.2;

        if (arr[idx + 2] > zMax) arr[idx + 2] -= zSpan;
        else if (arr[idx + 2] < zMin) arr[idx + 2] += zSpan;
      }
      attr.needsUpdate = true;
    }

    if (this.ashPoints) {
      const attr = this.ashPoints.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const count = Math.min(this.ashActiveCount, this.ashPhases.length);
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const ph = this.ashPhases[i];
        arr[idx] += Math.sin(elapsed * 0.9 + ph) * 0.22 * dt;
        arr[idx + 1] -= (0.16 + (ph % 0.12)) * dt; // Ash gently falls downward
        arr[idx + 2] += Math.cos(elapsed * 0.7 + ph) * 0.12 * dt;

        if (arr[idx] > halfW) arr[idx] = -halfW;
        else if (arr[idx] < -halfW) arr[idx] = halfW;

        if (arr[idx + 1] < 0.08) arr[idx + 1] = CEILING_HEIGHT - 0.15;

        if (arr[idx + 2] > zMax) arr[idx + 2] -= zSpan;
        else if (arr[idx + 2] < zMin) arr[idx + 2] += zSpan;
      }
      attr.needsUpdate = true;
    }
  }

  private updateTitleCamera(dt: number, elapsed: number): void {
    this.titleClock += dt;
    const swayZ = -4 - (Math.sin(this.titleClock * 0.24) * 0.5 + 0.5) * 14;
    const swayX = Math.sin(this.titleClock * 0.42) * 0.32;
    const lookYaw = Math.sin(this.titleClock * 0.33) * 0.14;
    const bobY = PLAYER_EYE_Y + Math.sin(this.titleClock * 1.4) * 0.03;

    this.camera.position.set(swayX, bobY, swayZ);
    this.camera.rotation.set(-0.04, lookYaw, Math.sin(this.titleClock * 0.5) * 0.015);
    this.flashlight.intensity = 7.8 + Math.sin(elapsed * 19) * 0.45;
    this.flashlight.angle = Math.PI / 6.2;
    this.flashlight.distance = 28;
    this.pulseLight.intensity = 0.25;
  }

  private updateIntro(dt: number, elapsed: number): void {
    this.introTimer += dt;
    const t = Math.min(1, this.introTimer / this.introDuration);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Fade in smoothly from pitch black over the opening 1.45 seconds
    this.introFadeOpacity = Math.max(0, 1 - Math.min(1, this.introTimer / 1.45));

    // Slow, ominous pan & dolly towards the entrance
    const camX = THREE.MathUtils.lerp(-1.18, 0, ease);
    const camY = THREE.MathUtils.lerp(1.42, PLAYER_EYE_Y, ease) + Math.sin(t * Math.PI) * 0.02;
    const camZ = THREE.MathUtils.lerp(2.85, 0, ease);
    const yaw = THREE.MathUtils.lerp(-0.34, 0, ease);
    const pitch = THREE.MathUtils.lerp(-0.08, 0, ease);
    const roll = THREE.MathUtils.lerp(0.025, 0, ease);

    this.camera.position.set(camX, camY, camZ);
    this.camera.rotation.set(pitch, yaw, roll);
    this.camera.fov = THREE.MathUtils.lerp(64, 68, ease);
    this.camera.updateProjectionMatrix();

    // Flashlight warms up with an uneasy low-frequency shimmer
    const beamWarmup = Math.min(1, this.introTimer / 1.15);
    const flicker = Math.sin(elapsed * 23) * 0.35;
    this.flashlight.intensity = beamWarmup * (9.5 + flicker);
    this.flashlight.distance = 28;
    this.flashlight.angle = Math.PI / 6.2;
    this.pulseLight.intensity = beamWarmup * 0.45;

    if (this.introTimer >= this.introDuration) {
      this.introFadeOpacity = 0;
      this.camera.position.set(0, PLAYER_EYE_Y, 0);
      this.camera.rotation.set(0, 0, 0);
      this.camera.fov = 68;
      this.camera.updateProjectionMatrix();
      this.lastStepPhase = 0;
      this.phase = 'playing';
      this.pushHud(true);
    }
  }

  private updateCutscene(dt: number, elapsed: number): void {
    if (this.mapId === 'escuela') {
      this.updateSchoolCutscene(dt, elapsed);
      return;
    }

    const rig = this.bedroomRig;
    if (!rig) {
      this.skipCutscene();
      return;
    }

    this.cutsceneTimer += dt;
    const t = this.cutsceneTimer;
    this.introFadeOpacity = Math.max(0, 1 - Math.min(1, t / 0.85));

    // Phase A (0..3.1s): Guy lies in bed scrolling TikTok
    if (t < 3.1) {
      if (t > 0.85 && this.cutsceneSwipeCount === 0) {
        this.cutsceneSwipeCount = 1;
        this.audio.playPhoneSwipe();
      } else if (t > 2.0 && this.cutsceneSwipeCount === 1) {
        this.cutsceneSwipeCount = 2;
        this.audio.playPhoneSwipe();
      }

      rig.guyRightArm.rotation.x = -0.95 + Math.sin(elapsed * 5.2) * 0.04;
      rig.phoneLight.intensity = 1.15 + Math.sin(elapsed * 8) * 0.18;

      if (t >= 1.25) {
        this.subtitleSpeaker = 'Tú';
        this.subtitleText = '— "Quiero ir al baño..."';
      } else {
        this.subtitleSpeaker = null;
        this.subtitleText = null;
      }

      const pan = Math.min(1, t / 3.1);
      const camX = THREE.MathUtils.lerp(-0.42, 0.25, pan * 0.55);
      const camY = THREE.MathUtils.lerp(1.54, 1.38, pan * 0.5);
      const camZ = THREE.MathUtils.lerp(4.45, 4.95, pan * 0.45);
      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(0.92, 0.96, 5.82);
    } else if (t < 4.9) {
      const u = (t - 3.1) / 1.8;
      const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

      if (t < 3.75) {
        this.subtitleSpeaker = 'Tú';
        this.subtitleText = '— "Quiero ir al baño..."';
      } else {
        this.subtitleSpeaker = null;
        this.subtitleText = null;
      }

      rig.phoneLight.intensity = Math.max(0, 1.2 * (1 - u * 2.2));
      rig.lampLight.intensity = Math.max(0, 1.35 * (1 - Math.max(0, u - 0.3) * 1.6));
      if (u > 0.48) {
        rig.phoneGroup.visible = false;
      }
      if (u > 0.55) {
        rig.flashlightProp.visible = false;
      }

      rig.guyTorsoPivot.rotation.x = THREE.MathUtils.lerp(-1.12, 0, Math.min(1, u * 1.4));
      rig.guyLegsPivot.rotation.x = THREE.MathUtils.lerp(-1.42, 0, Math.min(1, u * 1.4));
      rig.guyHead.rotation.x = THREE.MathUtils.lerp(0.32, 0, Math.min(1, u * 1.5));
      rig.guyGroup.position.set(
        THREE.MathUtils.lerp(1.2, 0.05, ease),
        THREE.MathUtils.lerp(0.72, 0.8, Math.sin(u * Math.PI) * 0.4 + u * 0.2),
        THREE.MathUtils.lerp(6.02, 3.3, ease),
      );
      rig.guyGroup.rotation.y = THREE.MathUtils.lerp(0, Math.PI, Math.min(1, u * 1.3));

      if (t >= 4.15 && !this.cutsceneLightClicked) {
        this.cutsceneLightClicked = true;
        this.audio.playFlashlightClick();
        this.audio.playIntroSwell();
      }
      if (t >= 4.25) {
        rig.guyGroup.visible = false;
        this.flashlight.intensity = THREE.MathUtils.lerp(0, 8.8, Math.min(1, (t - 4.25) / 0.55));
      }

      const camEase = Math.min(1, Math.max(0, (u - 0.2) / 0.8));
      const cE = camEase * camEase * (3 - 2 * camEase);
      this.camera.position.set(
        THREE.MathUtils.lerp(-0.05, 0, cE),
        THREE.MathUtils.lerp(1.46, PLAYER_EYE_Y, cE),
        THREE.MathUtils.lerp(4.7, 2.75, cE),
      );
      _vA.set(
        THREE.MathUtils.lerp(0.6, 0, cE),
        THREE.MathUtils.lerp(1.2, 1.48, cE),
        THREE.MathUtils.lerp(4.8, 0.5, cE),
      );
      this.camera.lookAt(_vA);
    } else {
      this.subtitleSpeaker = null;
      this.subtitleText = null;
      rig.guyGroup.visible = false;
      rig.phoneLight.intensity = 0;
      rig.lampLight.intensity = 0;

      if (!this.cutsceneDoorOpened) {
        this.cutsceneDoorOpened = true;
        this.audio.playDoorCreak();
      }

      const v = Math.min(1, (t - 4.9) / (this.cutsceneDuration - 4.9));
      const doorOpen = Math.min(1, (t - 4.9) / 1.15);
      const doorEase = 1 - Math.pow(1 - doorOpen, 3);
      rig.doorPivot.rotation.y = doorEase * 1.42;

      const walkEase = v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
      const curZ = THREE.MathUtils.lerp(2.75, 0, walkEase);
      const stride = Math.max(0, (2.75 - curZ) * 2.2);
      const stepIdx = Math.floor(stride / Math.PI);
      if (stepIdx > this.cutsceneLastStep) {
        this.cutsceneLastStep = stepIdx;
        this.audio.playFootstep(stepIdx);
      }

      this.camera.position.set(0, PLAYER_EYE_Y + Math.abs(Math.sin(stride)) * 0.045, curZ);
      this.camera.rotation.set(-0.02 * (1 - v), 0, Math.cos(stride) * 0.01);
      this.camera.fov = THREE.MathUtils.lerp(62, 68, v);
      this.camera.updateProjectionMatrix();

      this.flashlight.intensity = 9.2 + Math.sin(elapsed * 21) * 0.35;
      this.flashlight.distance = 28;
      this.flashlight.angle = Math.PI / 6.2;
      this.pulseLight.intensity = 0.45;
    }

    if (this.cutsceneTimer >= this.cutsceneDuration) {
      this.skipCutscene();
    }
  }

  private updateSchoolCutscene(dt: number, elapsed: number): void {
    const rig = this.classroomRig;
    if (!rig) {
      this.skipCutscene();
      return;
    }

    this.cutsceneTimer += dt;
    const t = this.cutsceneTimer;
    this.introFadeOpacity = Math.max(0, 1 - Math.min(1, t / 0.85));

    // Phase A (0..3.2s): Camera sits at school desk, then student stands up and asks "¿Puedo ir al baño?"
    if (t < 3.2) {
      if (t >= 1.1 && !this.cutsceneChairSlid) {
        this.cutsceneChairSlid = true;
        this.audio.playChairSlide();
      }

      const standU = THREE.MathUtils.clamp((t - 1.05) / 1.4, 0, 1);
      const standEase = standU < 0.5 ? 2 * standU * standU : 1 - Math.pow(-2 * standU + 2, 2) / 2;

      if (t >= 1.3) {
        this.subtitleSpeaker = 'Tú';
        this.subtitleText = '— "¿Puedo ir al baño?"';
      } else {
        this.subtitleSpeaker = null;
        this.subtitleText = null;
      }

      // Subtle idle teacher motion at chalkboard/desk
      rig.teacherHead.rotation.y = Math.sin(elapsed * 1.4) * 0.08;
      rig.roomLight.intensity = 2.0 + Math.sin(elapsed * 14) * 0.08;

      this.camera.position.set(
        THREE.MathUtils.lerp(-1.25, -0.68, standEase),
        THREE.MathUtils.lerp(1.12, PLAYER_EYE_Y, standEase),
        THREE.MathUtils.lerp(5.05, 4.95, standEase),
      );
      this.camera.lookAt(-0.45, 1.54, 8.2);
    } else if (t < 5.5) {
      // Phase B (3.2..5.5s): Teacher nods & gestures toward the door, replying yes in Spanish
      const u = (t - 3.2) / 2.3;

      if (!this.cutsceneTeacherReplied) {
        this.cutsceneTeacherReplied = true;
        this.audio.playTeacherReplyCue();
      }

      this.subtitleSpeaker = 'Maestro';
      this.subtitleText = '— "Sí, puedes ir. Ten cuidado en los pasillos..."';

      // Teacher looks toward student, nods, and raises arm gesturing permission toward hallway
      rig.teacherHead.rotation.y = THREE.MathUtils.lerp(0.18, 0.28, Math.sin(u * Math.PI));
      rig.teacherHead.rotation.x = Math.sin(u * Math.PI * 2.5) * 0.14;
      rig.teacherRightArm.rotation.x = -0.68 * Math.sin(Math.min(1, u * 1.4) * Math.PI * 0.75);
      rig.teacherRightArm.rotation.z = -0.25 * Math.sin(Math.min(1, u * 1.4) * Math.PI * 0.75);

      // Subtle eerie classroom light flicker right as teacher warns about the hallways
      rig.roomLight.intensity = u > 0.7 ? 1.4 + Math.sin(elapsed * 29) * 0.45 : 2.0;

      this.camera.position.set(-0.68, PLAYER_EYE_Y, 4.95);
      this.camera.lookAt(-0.45, 1.54, 8.2);
    } else {
      // Phase C (5.5..8.4s): Pick up flashlight, turn smoothly toward door, door creaks open & walk out
      this.subtitleSpeaker = null;
      this.subtitleText = null;

      const v = Math.min(1, (t - 5.5) / (this.schoolCutsceneDuration - 5.5));

      if (t >= 5.65 && !this.cutsceneLightClicked) {
        this.cutsceneLightClicked = true;
        rig.flashlightProp.visible = false;
        this.audio.playFlashlightClick();
        this.audio.playIntroSwell();
      }

      // Classroom light dims steeply while flashlight turns on
      rig.roomLight.intensity = Math.max(0.08, 1.85 * (1 - Math.min(1, v * 2.2)));
      const beamOn = t >= 5.65 ? Math.min(1, (t - 5.65) / 0.45) : 0;
      this.flashlight.intensity = beamOn * (9.2 + Math.sin(elapsed * 21) * 0.35);
      this.flashlight.distance = 28;
      this.flashlight.angle = Math.PI / 6.2;
      this.pulseLight.intensity = beamOn * 0.45;

      if (t >= 6.15 && !this.cutsceneDoorOpened) {
        this.cutsceneDoorOpened = true;
        this.audio.playDoorCreak();
      }

      const doorOpen = Math.min(1, Math.max(0, (t - 6.15) / 1.1));
      const doorEase = 1 - Math.pow(1 - doorOpen, 3);
      rig.doorPivot.rotation.y = doorEase * 1.42;

      // First 35% of Phase C rotates smoothly toward the doorway; remaining 65% walks into corridor
      const turnU = Math.min(1, v / 0.38);
      const turnEase = turnU < 0.5 ? 2 * turnU * turnU : 1 - Math.pow(-2 * turnU + 2, 2) / 2;

      const walkU = Math.max(0, (v - 0.25) / 0.75);
      const walkEase = walkU < 0.5 ? 2 * walkU * walkU : 1 - Math.pow(-2 * walkU + 2, 2) / 2;

      const curX = THREE.MathUtils.lerp(-0.68, 0, walkEase);
      const curZ = THREE.MathUtils.lerp(4.95, 0, walkEase);
      const distWalked = Math.hypot(curX + 0.68, curZ - 4.95);
      const stride = distWalked * 2.15;
      const stepIdx = Math.floor(stride / Math.PI);
      if (walkU > 0.05 && stepIdx > this.cutsceneLastStep) {
        this.cutsceneLastStep = stepIdx;
        this.audio.playFootstep(stepIdx);
      }

      this.camera.position.set(
        curX,
        PLAYER_EYE_Y + (walkU > 0.04 ? Math.abs(Math.sin(stride)) * 0.045 : 0),
        curZ,
      );

      // Smoothly sweep gaze clockwise from (+Z teacher) through (+X desk) toward (-Z hallway door)
      const sweepAngle = THREE.MathUtils.lerp(Math.PI, 0, turnEase);
      _vA.set(
        this.camera.position.x + Math.sin(sweepAngle) * 4.5,
        1.52,
        this.camera.position.z + Math.cos(sweepAngle) * 4.5,
      );
      if (walkU > 0.5) {
        _vA.lerp(_vB.set(0, PLAYER_EYE_Y - 0.04, -6), (walkU - 0.5) * 2);
      }
      this.camera.lookAt(_vA);
      this.camera.fov = THREE.MathUtils.lerp(64, 68, v);
      this.camera.updateProjectionMatrix();
    }

    if (this.cutsceneTimer >= this.schoolCutsceneDuration) {
      this.skipCutscene();
    }
  }

  private updateGameplay(dt: number, elapsed: number): void {
    this.elapsedSeconds += dt;
    const cfg = getDifficultyConfig(this.difficulty);

    // Cooldowns & decays
    if (this.pulseCooldown > 0) this.pulseCooldown = Math.max(0, this.pulseCooldown - dt);
    if (this.pulseFlash > 0) this.pulseFlash = Math.max(0, this.pulseFlash - dt * 2.8);
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8);
    if (this.shakeStrength > 0) this.shakeStrength = Math.max(0, this.shakeStrength - dt * 0.25);
    if (this.currentHintTimer > 0) {
      this.currentHintTimer -= dt;
      if (this.currentHintTimer <= 0) {
        this.currentHintKind = null;
      }
    }

    // Battery drain scaled by difficulty (+ Campana proximity drain)
    let extraDrain = 0;
    for (const a of this.anomalies) {
      if (!a.defeated && a.kind === 'campana') {
        const dz = this.playerZ - a.group.position.z;
        if (dz > -0.5 && dz < 14.5) {
          extraDrain += cfg.campanaDrainPerSec;
        }
      }
    }
    this.battery = Math.max(0, this.battery - (cfg.batteryDrainPerSec + extraDrain) * dt);
    if (this.battery <= 0) {
      this.flashlight.intensity = 0;
      this.triggerDefeat('La batería de tu linterna se agotó por completo en la oscuridad.');
      return;
    }

    // Check if an active anomaly is near to modulate forward pace fairly
    let nearestThreatDist = 999;
    let activeTargetKind: AnomalyKind | null = null;
    let activeTargetSubLabel = '';
    let activeTargetCharge = 0;

    for (const a of this.anomalies) {
      if (a.defeated) continue;
      const dz = this.playerZ - a.group.position.z;
      if (dz > -1.0 && dz < 18.0) {
        if (dz < nearestThreatDist) nearestThreatDist = dz;

        // First-encounter audio cue & subtle Spanish hint
        if (!a.alertPlayed && dz < 14.5) {
          a.alertPlayed = true;
          this.audio.playAnomalySpawn(a.kind);
          if (!this.seenHints[a.kind]) {
            this.seenHints[a.kind] = true;
            this.currentHintKind = a.kind;
            this.currentHintTimer = 5.5;
          }
        }
      }
    }

    // Forward auto-walk speed (slows slightly near active threats for fair reaction)
    const walkSpeed = nearestThreatDist < 9.5 ? cfg.walkSpeedThreat : cfg.walkSpeedNormal;
    this.playerZ -= walkSpeed * dt;
    this.walkDistance += walkSpeed * dt;

    // Smoothly adapt musical tension to threat distance, depth, and low battery
    const threatFactor = nearestThreatDist < 16 ? Math.max(0, 1 - nearestThreatDist / 16) : 0;
    const progressFactor = Math.min(0.35, (Math.abs(this.playerZ) / Math.abs(EXIT_Z)) * 0.35);
    const batteryStress = this.battery < 30 ? ((30 - this.battery) / 30) * 0.3 : 0;
    const targetTension = Math.min(1, 0.16 + threatFactor * 0.65 + progressFactor + batteryStress);
    this.currentTension = THREE.MathUtils.damp(this.currentTension, targetTension, 3.2, dt);

    // Fast, snappy velocity-based lateral strafing: A/D/Arrows + HUD hold buttons
    let steerDir = this.steerHold;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steerDir -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steerDir += 1;
    steerDir = THREE.MathUtils.clamp(steerDir, -1, 1);

    const aimSteerVel = steerDir === 0 ? -this.aimYaw * 1.25 : 0;
    const targetLateralVel = steerDir !== 0 ? steerDir * 5.25 : aimSteerVel;
    const lateralAccel = steerDir !== 0 ? 24 : 17;
    this.lateralVel = THREE.MathUtils.damp(this.lateralVel, targetLateralVel, lateralAccel, dt);
    this.playerX = THREE.MathUtils.clamp(this.playerX + this.lateralVel * dt, -1.72, 1.72);

    // Smooth camera & flashlight aiming scaled with accessibility sensitivity
    const aimLambda = 6.5 + 4.5 * this.sensitivity;
    this.aimYaw = THREE.MathUtils.damp(this.aimYaw, this.targetYaw, aimLambda, dt);
    this.aimPitch = THREE.MathUtils.damp(this.aimPitch, this.targetPitch, aimLambda, dt);

    // Steady head-bob & footsteps
    const stride = this.walkDistance * 2.3;
    const stepPhase = Math.floor(stride / Math.PI);
    if (stepPhase !== this.lastStepPhase) {
      this.lastStepPhase = stepPhase;
      this.stepCount++;
      this.audio.playFootstep(this.stepCount);
    }

    const bobY = Math.abs(Math.sin(stride)) * 0.055;
    const shakeX = (Math.random() - 0.5) * this.shakeStrength;
    const shakeY = (Math.random() - 0.5) * this.shakeStrength;
    const strafeTilt = -this.lateralVel * 0.011;

    this.camera.position.set(this.playerX + shakeX, PLAYER_EYE_Y + bobY + shakeY, this.playerZ);
    this.camera.rotation.set(this.aimPitch, this.aimYaw, Math.cos(stride) * 0.012 + strafeTilt);

    // Flashlight dimming & low-battery flicker
    const batRatio = this.battery / 100;
    let flicker = 1.0;
    if (this.battery < 24) {
      const n = Math.sin(elapsed * 37) * Math.cos(elapsed * 53);
      flicker = n > 0.55 ? 0.25 : 0.92;
    }
    const baseIntensity = (2.6 + batRatio * 8.4) * flicker;
    this.flashlight.intensity = baseIntensity + this.pulseFlash * 28.0;
    this.flashlight.distance = 13 + batRatio * 17 + this.pulseFlash * 10;
    this.flashlight.angle = Math.PI / 7.4 + batRatio * 0.1 + this.pulseFlash * 0.16;
    this.pulseLight.intensity = 0.2 + batRatio * 0.35 + this.pulseFlash * 6.5;

    // Collect glowing batteries
    for (const b of this.batteries) {
      if (b.collected) continue;
      b.spinGroup.rotation.y += 1.85 * dt;
      b.spinGroup.position.y = 0.42 + Math.sin(elapsed * 3.2 + b.id) * 0.06;

      const distXZ = Math.hypot(this.playerX - b.x, this.playerZ - b.z);
      if (distXZ < 1.18) {
        b.collected = true;
        b.group.visible = false;
        this.battery = Math.min(100, this.battery + cfg.batteryPickupAmount);
        this.batteriesCollected++;
        this.audio.playBatteryPickup();
        this.spawnBurst(b.x, 0.5, b.z, 0x10f5c8, 16);
      }
    }

    // Update anomalies
    for (const a of this.anomalies) {
      if (a.defeated) continue;

      const dz = this.playerZ - a.group.position.z;
      const dist = Math.hypot(this.playerX - a.group.position.x, dz);

      if (a.kind === 'sombra') {
        const lit = this.isAnomalyInBeam(a, 0.935, 14.5);
        if (lit && dz > 0) {
          a.dissolveProgress = Math.min(
            1,
            a.dissolveProgress + 0.78 * cfg.dissolveMultiplier * dt,
          );
          this.audio.playSombraBurnTick(a.dissolveProgress);
          a.group.position.x = a.baseX + (Math.random() - 0.5) * 0.14 * a.dissolveProgress;
          if (Math.random() < 0.35) {
            this.spawnBurst(a.group.position.x, 1.3, a.group.position.z, 0xc084fc, 1);
          }
          activeTargetKind = 'sombra';
          activeTargetSubLabel = `${Math.round(a.dissolveProgress * 100)}%`;
          activeTargetCharge = a.dissolveProgress;

          if (a.dissolveProgress >= 1) {
            this.defeatAnomaly(a);
            continue;
          }
        } else {
          a.dissolveProgress = Math.max(0, a.dissolveProgress - 0.32 * dt);
          a.group.position.x = a.baseX + Math.sin(elapsed * 2.1 + a.id) * 0.18;
        }

        const alpha = 1 - a.dissolveProgress * 0.75;
        a.materials[0].opacity = alpha;
        a.materials[1].opacity = alpha * 0.75;
        a.materials[0].emissiveIntensity = 0.4 + a.dissolveProgress * 2.2;
        a.coreParts[3].rotation.z += dt * (1.8 + a.dissolveProgress * 9);

        if (dist < 1.35) {
          this.triggerJumpscare(a, 'La Sombra Acechante te envolvió en la oscuridad.');
          return;
        }
      } else if (a.kind === 'ojo') {
        a.coreParts[0].lookAt(this.camera.position);
        const pulseScale = 1 + Math.sin(elapsed * 5 + a.id) * 0.06;
        a.coreParts[1].scale.setScalar(pulseScale);

        if (this.isAnomalyInBeam(a, 0.89, 16) && dz > 0) {
          activeTargetKind = 'ojo';
          activeTargetSubLabel = '¡Pulso de luz!';
          activeTargetCharge = 1;
        }

        if (dz < 0.75 && dz > -0.6) {
          this.triggerJumpscare(a, 'La mirada del Ojo Vigilante paralizó tus sentidos.');
          return;
        }
      } else if (a.kind === 'figura') {
        const lit = this.isAnomalyInBeam(a, 0.84, 18);
        if (dz > 0 && dz < 16.5) {
          const speed = lit ? 0.55 * cfg.creepMultiplier : a.creepSpeed;
          a.group.position.z += speed * dt;
          a.group.position.x = THREE.MathUtils.damp(a.group.position.x, this.playerX, 1.1, dt);
          a.coreParts[0].rotation.z = -0.18 + Math.sin(elapsed * 11) * 0.16;
          a.coreParts[1].rotation.x = -0.32 + Math.sin(elapsed * 9) * 0.25;
          a.coreParts[2].rotation.x = -0.32 - Math.sin(elapsed * 9) * 0.25;
        }

        if (lit && dz > 0) {
          activeTargetKind = 'figura';
          activeTargetSubLabel = '¡Tócala ahora!';
          activeTargetCharge = 1;
        }

        const newDz = this.playerZ - a.group.position.z;
        const newDist = Math.hypot(this.playerX - a.group.position.x, newDz);
        if (newDist < 1.32) {
          this.triggerJumpscare(a, 'La Figura Errante te atrapó en el pasillo.');
          return;
        }
      } else if (a.kind === 'prefecta') {
        // La Prefecta Sin Rostro: avoid shining light directly on her & dodge opposite lane
        const lit = this.isAnomalyInBeam(a, 0.88, 15.5) && dz > 0;
        if (lit) {
          a.dissolveProgress = Math.min(1, a.dissolveProgress + 0.88 * cfg.creepMultiplier * dt);
          activeTargetKind = 'prefecta';
          activeTargetSubLabel = '¡APARTA LA LUZ!';
          activeTargetCharge = a.dissolveProgress;
        } else {
          a.dissolveProgress = Math.max(0, a.dissolveProgress - 0.55 * dt);
        }

        // Provoked by beam -> stalks directly toward player's lane!
        if (dz > 0 && dz < 16 && a.dissolveProgress > 0.24) {
          const chase = a.creepSpeed * (0.9 + a.dissolveProgress * 1.45);
          a.group.position.z += chase * dt;
          a.group.position.x = THREE.MathUtils.damp(a.group.position.x, this.playerX, 1.85, dt);
        }

        a.coreParts[0].rotation.z = Math.sin(elapsed * (3 + a.dissolveProgress * 14)) * (0.08 + a.dissolveProgress * 0.25);
        a.coreParts[2].rotation.x = -0.45 - a.dissolveProgress * 0.55;
        a.materials[2].emissiveIntensity = 0.4 + a.dissolveProgress * 2.8;
        a.materials[3].emissiveIntensity = 0.65 + a.dissolveProgress * 3.0;

        const newDz = this.playerZ - a.group.position.z;
        const newDist = Math.hypot(this.playerX - a.group.position.x, newDz);
        if (newDist < 1.3) {
          this.triggerJumpscare(a, 'Iluminaste demasiado a La Prefecta Sin Rostro.');
          return;
        }

        // Successfully slipped past her in the opposite lane without provoking her!
        if (newDz < -0.65) {
          this.defeatAnomaly(a);
          continue;
        }
      } else if (a.kind === 'alumna') {
        // La Alumna de Tiza: tap/click 3 times while lit to shatter chalk armor
        const lit = this.isAnomalyInBeam(a, 0.84, 18);
        if (dz > 0 && dz < 16.5) {
          const speed = lit ? 0.62 * cfg.creepMultiplier : a.creepSpeed;
          a.group.position.z += speed * dt;
          a.group.position.x = THREE.MathUtils.damp(a.group.position.x, this.playerX, 1.15, dt);
          a.coreParts[0].rotation.z = 0.22 + Math.sin(elapsed * 13) * 0.14;
          a.coreParts[1].rotation.x = -0.58 + Math.sin(elapsed * 10) * 0.22;
          a.coreParts[2].rotation.x = -0.58 - Math.sin(elapsed * 10) * 0.22;
        }
        a.coreParts[3].rotation.y += dt * 3.2;

        if (lit && dz > 0) {
          const rem = a.hitsRemaining ?? 3;
          const max = a.maxHits ?? 3;
          activeTargetKind = 'alumna';
          activeTargetSubLabel = `Toques: ${rem} / ${max}`;
          activeTargetCharge = (max - rem) / max;
        }

        const newDz = this.playerZ - a.group.position.z;
        const newDist = Math.hypot(this.playerX - a.group.position.x, newDz);
        if (newDist < 1.32) {
          this.triggerJumpscare(a, 'La Alumna de Tiza te alcanzó entre las bancas.');
          return;
        }
      } else if (a.kind === 'campana') {
        // La Campana Maldita: swings, rings & drains battery until silenced by Pulso
        const swingSpeed = dz > 0 && dz < 15 ? 11.5 : 4.2;
        a.coreParts[0].rotation.z = Math.sin(elapsed * swingSpeed + a.id) * 0.36;
        const ringPulse = 1 + Math.sin(elapsed * 8.5 + a.id) * 0.14;
        a.coreParts[1].scale.setScalar(ringPulse);

        if (this.isAnomalyInBeam(a, 0.89, 16) && dz > 0) {
          activeTargetKind = 'campana';
          activeTargetSubLabel = '¡Usa Pulso de luz!';
          activeTargetCharge = 1;
        }

        if (dz < 0.78 && dz > -0.6) {
          this.triggerJumpscare(a, 'El estruendo de La Campana Maldita quebró tu mente.');
          return;
        }
      }
    }

    // Check victory at exit door
    if (this.playerZ <= EXIT_Z + 1.8) {
      this.triggerVictory();
      return;
    }

    // Store active target for HUD reticle feedback
    this.hudTargetKind = activeTargetKind;
    this.hudTargetSubLabel = activeTargetSubLabel;
    this.hudTargetCharge = activeTargetCharge;
  }

  private hudTargetKind: AnomalyKind | null = null;
  private hudTargetSubLabel = '';
  private hudTargetCharge = 0;

  private pushHud(force = false): void {
    const now = performance.now();
    const minInterval = this.phase === 'intro' || this.phase === 'cutscene' ? 16 : 75;
    if (!force && now - this.lastHudPush < minInterval) return;
    this.lastHudPush = now;

    this.onHudUpdate({
      phase: this.phase,
      paused: this.paused,
      mapId: this.mapId,
      difficulty: this.difficulty,
      battery: Math.round(this.battery),
      progress: Math.min(100, Math.max(0, Math.round((Math.abs(this.playerZ) / Math.abs(EXIT_Z)) * 100))),
      batteriesCollected: this.batteriesCollected,
      anomaliesDefeated: this.anomaliesDefeated,
      pulseCooldown: Math.min(1, this.pulseCooldown / 0.72),
      activeTarget: {
        kind: this.hudTargetKind,
        label: this.hudTargetKind ? ANOMALY_NAMES[this.hudTargetKind] : '',
        subLabel: this.hudTargetSubLabel,
        charge: this.hudTargetCharge,
      },
      hintTitle: this.currentHintKind ? ANOMALY_NAMES[this.currentHintKind] : null,
      hintText: this.currentHintKind ? ANOMALY_HINTS[this.currentHintKind] : null,
      subtitleSpeaker: this.subtitleSpeaker,
      subtitleText: this.subtitleText,
      defeatedBy: this.defeatedBy,
      defeatReason: this.defeatReason,
      elapsedSeconds: Math.floor(this.elapsedSeconds),
      damageFlash: this.damageFlash,
      pulseFlash: this.pulseFlash,
      jumpscareFlash: this.jumpscareFlash,
      introFadeOpacity: this.introFadeOpacity,
    });
  }

  private updateJumpscare(dt: number, elapsed: number): void {
    this.jumpscareTimer += dt;
    const t = Math.min(1, this.jumpscareTimer / this.jumpscareDuration);
    const actor = this.jumpscareActor;

    // Violent decaying high-frequency camera shake + dramatic FOV lunge
    const shakeAmp = (1 - t * 0.4) * 0.11;
    const camShakeX = (Math.random() - 0.5) * shakeAmp;
    const camShakeY = (Math.random() - 0.5) * shakeAmp;
    const rollJitter = Math.sin(elapsed * 62) * 0.14 * (1 - t * 0.35);
    const pitchSnap = Math.sin(elapsed * 48) * 0.09;

    this.camera.position.set(
      this.jumpscareBaseCamX + camShakeX,
      this.jumpscareBaseCamY + camShakeY,
      this.jumpscareBaseCamZ,
    );
    this.camera.rotation.set(
      this.jumpscareBasePitch * (1 - t * 0.65) + pitchSnap,
      this.jumpscareBaseYaw * (1 - t * 0.65) + (Math.random() - 0.5) * 0.08,
      rollJitter,
    );
    this.camera.fov = 68 - Math.sin(Math.min(1, t * 2.2) * Math.PI) * 16;
    this.camera.updateProjectionMatrix();

    // Strobing emergency / horror lighting flash
    const strobe = Math.sin(elapsed * 58) > 0 ? 1 : 0.28;
    this.jumpscareFlash = strobe * (1 - t * 0.25);
    this.damageFlash = 0.65 + strobe * 0.35;
    this.flashlight.intensity = 5 + strobe * 18;
    this.pulseLight.intensity = 1.2 + strobe * 4.5;

    if (actor) {
      // Place anomaly directly along the camera's forward look axis
      this.camera.getWorldDirection(_vDir);
      _vRight.crossVectors(_vDir, _up).normalize();

      if (actor.kind === 'sombra') {
        // Sombra Acechante: lunges out of darkness, spreads clawed arms, eyes flare violet
        this.jumpscareLight.color.setHex(strobe > 0.5 ? 0xc084fc : 0xe11d48);
        this.jumpscareLight.intensity = 6 + strobe * 16;

        const lungeDist = THREE.MathUtils.lerp(1.48, 0.56, Math.min(1, t * 2.6));
        _vA.copy(this.camera.position).addScaledVector(_vDir, lungeDist);
        actor.group.position.set(_vA.x, this.camera.position.y - 1.98, _vA.z);
        actor.group.scale.setScalar(1.15 + Math.sin(t * Math.PI) * 0.14);
        actor.group.lookAt(this.camera.position.x, actor.group.position.y, this.camera.position.z);

        // Aggressive head snap & clawed arms lunging toward player
        actor.coreParts[0].rotation.z = Math.sin(elapsed * 44) * 0.35;
        actor.coreParts[1].rotation.x = -1.25 + Math.sin(elapsed * 32) * 0.25;
        actor.coreParts[2].rotation.x = -1.25 - Math.sin(elapsed * 32) * 0.25;
        actor.coreParts[3].rotation.z += dt * 18;
        actor.materials[2].emissiveIntensity = 5.5;
      } else if (actor.kind === 'ojo') {
        // Ojo Vigilante: swells massively right in front of face, spinning crimson ring
        this.jumpscareLight.color.setHex(strobe > 0.5 ? 0xff1e33 : 0xffffff);
        this.jumpscareLight.intensity = 8 + strobe * 18;

        const lungeDist = THREE.MathUtils.lerp(1.38, 0.58, Math.min(1, t * 2.8));
        _vA.copy(this.camera.position).addScaledVector(_vDir, lungeDist);
        actor.group.position.set(_vA.x, this.camera.position.y + Math.sin(elapsed * 40) * 0.04, _vA.z);
        actor.group.scale.setScalar(1.35 + Math.sin(elapsed * 36) * 0.24);
        actor.group.lookAt(this.camera.position);
        actor.coreParts[0].lookAt(this.camera.position);
        actor.coreParts[1].rotation.z += dt * 22;
        actor.coreParts[1].scale.setScalar(1.15 + strobe * 0.25);
        actor.materials[2].emissiveIntensity = 4.5;
      } else if (actor.kind === 'figura') {
        // Figura Errante: porcelain-masked toy mannequin slams into view, violently snapping head
        this.jumpscareLight.color.setHex(strobe > 0.5 ? 0xf5b800 : 0xff2238);
        this.jumpscareLight.intensity = 7 + strobe * 16;

        const lungeDist = THREE.MathUtils.lerp(1.42, 0.54, Math.min(1, t * 2.9));
        _vA.copy(this.camera.position).addScaledVector(_vDir, lungeDist);
        actor.group.position.set(_vA.x, this.camera.position.y - 1.78, _vA.z);
        actor.group.scale.setScalar(1.1 + Math.sin(t * Math.PI) * 0.12);
        actor.group.lookAt(this.camera.position.x, actor.group.position.y, this.camera.position.z);

        actor.coreParts[0].rotation.z = Math.sin(elapsed * 52) * 0.52;
        actor.coreParts[0].rotation.x = Math.cos(elapsed * 38) * 0.22;
        actor.coreParts[1].rotation.x = -1.45 + Math.sin(elapsed * 40) * 0.3;
        actor.coreParts[2].rotation.x = -1.45 - Math.sin(elapsed * 40) * 0.3;
        actor.materials[2].emissiveIntensity = 1.4 + strobe * 1.4;
      } else if (actor.kind === 'prefecta') {
        // La Prefecta Sin Rostro: looms towering into frame, stitched face pulsing crimson
        this.jumpscareLight.color.setHex(strobe > 0.5 ? 0xfb7185 : 0xdc2626);
        this.jumpscareLight.intensity = 7 + strobe * 16;

        const lungeDist = THREE.MathUtils.lerp(1.45, 0.52, Math.min(1, t * 2.8));
        _vA.copy(this.camera.position).addScaledVector(_vDir, lungeDist);
        actor.group.position.set(_vA.x, this.camera.position.y - 1.98, _vA.z);
        actor.group.scale.setScalar(1.12 + Math.sin(t * Math.PI) * 0.12);
        actor.group.lookAt(this.camera.position.x, actor.group.position.y, this.camera.position.z);

        actor.coreParts[0].rotation.z = Math.sin(elapsed * 46) * 0.3;
        actor.coreParts[1].rotation.x = -1.3 + Math.sin(elapsed * 34) * 0.28;
        actor.coreParts[2].rotation.x = -1.3 - Math.sin(elapsed * 34) * 0.28;
        actor.materials[2].emissiveIntensity = 1.6 + strobe * 2.2;
        actor.materials[3].emissiveIntensity = 3.5;
      } else if (actor.kind === 'alumna') {
        // La Alumna de Tiza: frantic chalk-cracked visage lunges with flailing shards
        this.jumpscareLight.color.setHex(strobe > 0.5 ? 0x67e8f9 : 0xe11d48);
        this.jumpscareLight.intensity = 7 + strobe * 17;

        const lungeDist = THREE.MathUtils.lerp(1.4, 0.5, Math.min(1, t * 3.0));
        _vA.copy(this.camera.position).addScaledVector(_vDir, lungeDist);
        actor.group.position.set(_vA.x, this.camera.position.y - 1.66, _vA.z);
        actor.group.scale.setScalar(1.14 + Math.sin(t * Math.PI) * 0.14);
        actor.group.lookAt(this.camera.position.x, actor.group.position.y, this.camera.position.z);

        actor.coreParts[0].rotation.z = Math.sin(elapsed * 56) * 0.55;
        actor.coreParts[1].rotation.x = -1.48 + Math.sin(elapsed * 42) * 0.3;
        actor.coreParts[2].rotation.x = -1.48 - Math.sin(elapsed * 42) * 0.3;
        actor.coreParts[3].rotation.y += dt * 16;
        actor.materials[2].emissiveIntensity = 2.0 + strobe * 1.8;
      } else {
        // La Campana Maldita: violently tolls & shakes right in front of the player's face
        this.jumpscareLight.color.setHex(strobe > 0.5 ? 0xff2b3d : 0xfbbf24);
        this.jumpscareLight.intensity = 8 + strobe * 18;

        const lungeDist = THREE.MathUtils.lerp(1.42, 0.58, Math.min(1, t * 2.7));
        _vA.copy(this.camera.position).addScaledVector(_vDir, lungeDist);
        actor.group.position.set(_vA.x, this.camera.position.y + 0.35 + Math.sin(elapsed * 44) * 0.05, _vA.z);
        actor.group.scale.setScalar(1.3 + Math.sin(elapsed * 36) * 0.22);
        actor.group.lookAt(this.camera.position.x, actor.group.position.y, this.camera.position.z);
        actor.coreParts[0].rotation.z = Math.sin(elapsed * 48) * 0.62;
        actor.coreParts[1].scale.setScalar(1.25 + strobe * 0.3);
        actor.materials[2].emissiveIntensity = 4.8;
      }
    }

    if (this.jumpscareTimer >= this.jumpscareDuration) {
      this.jumpscareLight.intensity = 0;
      this.jumpscareFlash = 0;
      this.camera.fov = 68;
      this.camera.updateProjectionMatrix();
      if (this.jumpscareActor) {
        this.jumpscareActor.group.visible = false;
        this.jumpscareActor = null;
      }
      this.phase = 'defeat';
      this.pushHud(true);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        gl.deleteSync(sync);
        return;
      }
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private loop = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.05);
    const elapsed = now * 0.001;

    // Flicker wall sconces eerily (scaled by graphics quality lighting detail)
    for (const s of this.sconceLights) {
      if (this.graphicsQuality === 'baja') {
        s.light.intensity = s.baseIntensity * this.sconceDetailMultiplier;
      } else {
        const f = Math.sin(elapsed * 9 + s.phase) * Math.sin(elapsed * 23 + s.phase);
        s.light.intensity = (s.baseIntensity + (f > 0.6 ? -1.4 : f * 0.35)) * this.sconceDetailMultiplier;
      }
    }

    if (!this.paused) {
      // Animate floating dust motes & falling ash flakes around player
      this.updateAtmosphericParticles(dt, elapsed);
      this.updateParticles(dt);
    }

    if (this.phase === 'title') {
      this.updateTitleCamera(dt, elapsed);
      this.audio.updateHum(false, 100);
      this.audio.updateAmbience(dt, true);
      this.audio.updateMusic(dt, false, 0);
    } else if (this.paused) {
      this.audio.updateHum(false, this.battery);
      this.audio.updateAmbience(dt, false);
      this.audio.updateMusic(dt, false, 0);
    } else if (this.phase === 'cutscene') {
      this.updateCutscene(dt, elapsed);
      this.audio.updateHum(this.cutsceneLightClicked, 100);
      this.audio.updateAmbience(dt, true);
      this.audio.updateMusic(dt, false, 0);
      this.pushHud(false);
    } else if (this.phase === 'intro') {
      this.updateIntro(dt, elapsed);
      this.audio.updateHum(true, 100);
      this.audio.updateAmbience(dt, true);
      this.audio.updateMusic(dt, false, 0);
      this.pushHud(false);
    } else if (this.phase === 'playing') {
      this.updateGameplay(dt, elapsed);
      this.audio.updateHum(true, this.battery);
      this.audio.updateAmbience(dt, true);
      this.audio.updateMusic(dt, true, this.currentTension);
      this.pushHud(false);
    } else if (this.phase === 'jumpscare') {
      this.updateJumpscare(dt, elapsed);
      this.audio.updateHum(false, this.battery);
      this.audio.updateMusic(dt, false, 0);
      this.pushHud(false);
    } else {
      this.audio.updateHum(false, this.battery);
      this.audio.updateMusic(dt, false, 0);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.loop);
    } else {
      this.frameId = requestAnimationFrame(this.loop);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.cleanupListeners();
    this.audio.dispose();
    this.textures.dispose();
    this.envRT?.dispose();

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Points).isPoints) {
        const renderable = obj as THREE.Mesh | THREE.Points;
        renderable.geometry?.dispose();
        if (Array.isArray(renderable.material)) {
          renderable.material.forEach((m) => m.dispose());
        } else {
          renderable.material?.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
