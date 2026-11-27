import * as THREE from 'three';

export interface ProceduralTextureSet {
  woodMap: THREE.CanvasTexture;
  woodRoughness: THREE.CanvasTexture;
  wallpaperMap: THREE.CanvasTexture;
  ceilingMap: THREE.CanvasTexture;
  hazardMap: THREE.CanvasTexture;
  irisMap: THREE.CanvasTexture;
  maskMap: THREE.CanvasTexture;
  exitSignMap: THREE.CanvasTexture;
  glowMap: THREE.CanvasTexture;
  ashMap: THREE.CanvasTexture;
  linoleumMap: THREE.CanvasTexture;
  linoleumRoughness: THREE.CanvasTexture;
  schoolWallMap: THREE.CanvasTexture;
  acousticCeilingMap: THREE.CanvasTexture;
  chalkboardMap: THREE.CanvasTexture;
  lockerMap: THREE.CanvasTexture;
  tiktokScreenMap: THREE.CanvasTexture;
  prefectaFaceMap: THREE.CanvasTexture;
  alumnaFaceMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function configureTexture(
  tex: THREE.CanvasTexture,
  maxAnisotropy: number,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTextureSet {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // 1. Dark worn hardwood floor
  const [woodC, woodCtx] = makeCanvas(512, 512);
  woodCtx.fillStyle = '#241a13';
  woodCtx.fillRect(0, 0, 512, 512);
  const plankCount = 8;
  const plankW = 512 / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const x = i * plankW;
    const tone = 24 + ((i * 19) % 14);
    woodCtx.fillStyle = `rgb(${tone + 14}, ${tone + 5}, ${tone - 3})`;
    woodCtx.fillRect(x + 1, 0, plankW - 2, 512);

    // Grain lines
    for (let g = 0; g < 18; g++) {
      const gx = x + 3 + Math.random() * (plankW - 6);
      woodCtx.strokeStyle = `rgba(10, 6, 4, ${0.18 + Math.random() * 0.2})`;
      woodCtx.lineWidth = 1 + Math.random() * 1.5;
      woodCtx.beginPath();
      woodCtx.moveTo(gx, 0);
      woodCtx.bezierCurveTo(
        gx + (Math.random() - 0.5) * 8,
        170,
        gx + (Math.random() - 0.5) * 8,
        340,
        gx,
        512,
      );
      woodCtx.stroke();
    }
    // Plank cross seam
    const seamY = ((i * 173 + 80) % 440) + 30;
    woodCtx.fillStyle = '#0c0806';
    woodCtx.fillRect(x, seamY, plankW, 3);
    woodCtx.fillRect(x, 0, 2, 512);
  }
  // Dust & grime patches
  for (let s = 0; s < 16; s++) {
    const rx = Math.random() * 512;
    const ry = Math.random() * 512;
    const rad = 25 + Math.random() * 65;
    const grd = woodCtx.createRadialGradient(rx, ry, 2, rx, ry, rad);
    grd.addColorStop(0, 'rgba(8, 8, 10, 0.35)');
    grd.addColorStop(1, 'rgba(8, 8, 10, 0)');
    woodCtx.fillStyle = grd;
    woodCtx.fillRect(rx - rad, ry - rad, rad * 2, rad * 2);
  }
  const woodMap = configureTexture(new THREE.CanvasTexture(woodC), maxAniso, true, 2, 18);

  // Wood roughness map (linear)
  const [roughC, roughCtx] = makeCanvas(256, 256);
  roughCtx.fillStyle = '#999999';
  roughCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    roughCtx.fillStyle = i % 2 === 0 ? '#777777' : '#bbbbbb';
    roughCtx.fillRect(i * 32 + 2, 0, 28, 256);
    roughCtx.fillStyle = '#ffffff';
    roughCtx.fillRect(i * 32, 0, 2, 256);
  }
  const woodRoughness = configureTexture(new THREE.CanvasTexture(roughC), maxAniso, false, 2, 18);

  // 2. Peeling damp striped wallpaper
  const [wallC, wallCtx] = makeCanvas(512, 512);
  wallCtx.fillStyle = '#1b2024';
  wallCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16; i++) {
    wallCtx.fillStyle = i % 2 === 0 ? '#232a2e' : '#15191d';
    wallCtx.fillRect(i * 32, 0, 16, 512);
  }
  // Vertical damp streaks and grime
  for (let d = 0; d < 28; d++) {
    const dx = Math.random() * 512;
    const dw = 10 + Math.random() * 36;
    const dh = 120 + Math.random() * 340;
    const grd = wallCtx.createLinearGradient(dx, 0, dx, dh);
    grd.addColorStop(0, 'rgba(7, 9, 10, 0.55)');
    grd.addColorStop(1, 'rgba(7, 9, 10, 0)');
    wallCtx.fillStyle = grd;
    wallCtx.fillRect(dx, 0, dw, dh);
  }
  // Peeling patches showing dark plaster
  for (let p = 0; p < 10; p++) {
    const px = Math.random() * 440;
    const py = Math.random() * 440;
    wallCtx.fillStyle = 'rgba(26, 22, 18, 0.72)';
    wallCtx.beginPath();
    wallCtx.ellipse(px, py, 14 + Math.random() * 24, 24 + Math.random() * 40, 0.2, 0, Math.PI * 2);
    wallCtx.fill();
  }
  const wallpaperMap = configureTexture(new THREE.CanvasTexture(wallC), maxAniso, true, 16, 1);

  // 3. Cracked ceiling plaster
  const [ceilC, ceilCtx] = makeCanvas(512, 512);
  ceilCtx.fillStyle = '#121317';
  ceilCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 24; i++) {
    ceilCtx.strokeStyle = 'rgba(4, 4, 6, 0.65)';
    ceilCtx.lineWidth = 1 + Math.random() * 2;
    ceilCtx.beginPath();
    let cx = Math.random() * 512;
    let cy = Math.random() * 512;
    ceilCtx.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (Math.random() - 0.5) * 70;
      cy += (Math.random() - 0.5) * 70;
      ceilCtx.lineTo(cx, cy);
    }
    ceilCtx.stroke();
  }
  const ceilingMap = configureTexture(new THREE.CanvasTexture(ceilC), maxAniso, true, 2, 16);

  // 4. Poppy-Playtime-style worn industrial hazard trim
  const [hazC, hazCtx] = makeCanvas(256, 64);
  hazCtx.fillStyle = '#121215';
  hazCtx.fillRect(0, 0, 256, 64);
  hazCtx.fillStyle = '#c89208';
  for (let x = -64; x < 320; x += 48) {
    hazCtx.beginPath();
    hazCtx.moveTo(x, 64);
    hazCtx.lineTo(x + 24, 64);
    hazCtx.lineTo(x + 56, 0);
    hazCtx.lineTo(x + 32, 0);
    hazCtx.closePath();
    hazCtx.fill();
  }
  // Scuff overlay
  hazCtx.fillStyle = 'rgba(8, 8, 10, 0.35)';
  for (let s = 0; s < 35; s++) {
    hazCtx.fillRect(Math.random() * 256, Math.random() * 64, 12, 4);
  }
  const hazardMap = configureTexture(new THREE.CanvasTexture(hazC), maxAniso, true, 24, 1);

  // 5. Ojo Vigilante creepy eyeball texture
  const [irisC, irisCtx] = makeCanvas(256, 256);
  irisCtx.fillStyle = '#d8cec4';
  irisCtx.fillRect(0, 0, 256, 256);
  // Bloodshot veins around edges
  for (let v = 0; v < 26; v++) {
    const ang = (v / 26) * Math.PI * 2;
    irisCtx.strokeStyle = 'rgba(170, 20, 28, 0.72)';
    irisCtx.lineWidth = 1.6;
    irisCtx.beginPath();
    irisCtx.moveTo(128 + Math.cos(ang) * 124, 128 + Math.sin(ang) * 124);
    irisCtx.quadraticCurveTo(
      128 + Math.cos(ang + 0.14) * 86,
      128 + Math.sin(ang + 0.14) * 86,
      128 + Math.cos(ang) * 58,
      128 + Math.sin(ang) * 58,
    );
    irisCtx.stroke();
  }
  // Outer iris glow
  const irisGrd = irisCtx.createRadialGradient(128, 128, 14, 128, 128, 56);
  irisGrd.addColorStop(0, '#ff3b1f');
  irisGrd.addColorStop(0.55, '#c81d25');
  irisGrd.addColorStop(1, '#2a0509');
  irisCtx.fillStyle = irisGrd;
  irisCtx.beginPath();
  irisCtx.arc(128, 128, 56, 0, Math.PI * 2);
  irisCtx.fill();
  // Slit pupil
  irisCtx.fillStyle = '#050203';
  irisCtx.beginPath();
  irisCtx.ellipse(128, 128, 10, 38, 0, 0, Math.PI * 2);
  irisCtx.fill();
  const irisMap = configureTexture(new THREE.CanvasTexture(irisC), maxAniso, true, 1, 1);
  irisMap.wrapS = THREE.ClampToEdgeWrapping;
  irisMap.wrapT = THREE.ClampToEdgeWrapping;

  // 6. Porcelain Toy Mask for Figura Errante
  const [maskC, maskCtx] = makeCanvas(256, 256);
  maskCtx.fillStyle = '#d6cfc2';
  maskCtx.fillRect(0, 0, 256, 256);
  // Grime shading
  const mGrd = maskCtx.createRadialGradient(128, 128, 40, 128, 128, 140);
  mGrd.addColorStop(0, 'rgba(0,0,0,0)');
  mGrd.addColorStop(1, 'rgba(18,14,12,0.55)');
  maskCtx.fillStyle = mGrd;
  maskCtx.fillRect(0, 0, 256, 256);
  // Hollow black eye sockets
  maskCtx.fillStyle = '#09090b';
  maskCtx.beginPath();
  maskCtx.ellipse(86, 102, 22, 26, -0.1, 0, Math.PI * 2);
  maskCtx.ellipse(170, 102, 22, 26, 0.1, 0, Math.PI * 2);
  maskCtx.fill();
  // Pinprick pupils
  maskCtx.fillStyle = '#ff2f45';
  maskCtx.beginPath();
  maskCtx.arc(86, 102, 4.5, 0, Math.PI * 2);
  maskCtx.arc(170, 102, 4.5, 0, Math.PI * 2);
  maskCtx.fill();
  // Jagged wide stitched grin
  maskCtx.strokeStyle = '#180c0e';
  maskCtx.lineWidth = 6;
  maskCtx.beginPath();
  maskCtx.moveTo(64, 158);
  maskCtx.quadraticCurveTo(128, 206, 192, 158);
  maskCtx.stroke();
  maskCtx.lineWidth = 3;
  for (let sx = 76; sx <= 180; sx += 16) {
    const sy = 166 + Math.sin(((sx - 64) / 128) * Math.PI) * 18;
    maskCtx.beginPath();
    maskCtx.moveTo(sx, sy - 11);
    maskCtx.lineTo(sx, sy + 11);
    maskCtx.stroke();
  }
  const maskMap = configureTexture(new THREE.CanvasTexture(maskC), maxAniso, true, 1, 1);

  // 7. Spanish Exit Sign ("SALIDA")
  const [exitC, exitCtx] = makeCanvas(512, 160);
  exitCtx.fillStyle = '#071a12';
  exitCtx.fillRect(0, 0, 512, 160);
  exitCtx.strokeStyle = '#10b981';
  exitCtx.lineWidth = 10;
  exitCtx.strokeRect(8, 8, 496, 144);
  exitCtx.fillStyle = '#34d399';
  exitCtx.font = 'bold 88px system-ui, sans-serif';
  exitCtx.textAlign = 'center';
  exitCtx.textBaseline = 'middle';
  exitCtx.fillText('SALIDA', 256, 84);
  const exitSignMap = configureTexture(new THREE.CanvasTexture(exitC), maxAniso, true, 1, 1);

  // 8. Soft Radial Contact Glow / Shadow Disc
  const [glowC, glowCtx] = makeCanvas(128, 128);
  const gGrd = glowCtx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gGrd.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  gGrd.addColorStop(0.45, 'rgba(255, 255, 255, 0.35)');
  gGrd.addColorStop(1, 'rgba(255, 255, 255, 0)');
  glowCtx.fillStyle = gGrd;
  glowCtx.fillRect(0, 0, 128, 128);
  const glowMap = configureTexture(new THREE.CanvasTexture(glowC), 1, true, 1, 1);

  // 9. Organic Floating Ash Flake Sprite
  const [ashC, ashCtx] = makeCanvas(64, 64);
  ashCtx.clearRect(0, 0, 64, 64);
  const ashGrd = ashCtx.createRadialGradient(32, 32, 2, 32, 32, 28);
  ashGrd.addColorStop(0, 'rgba(226, 224, 218, 0.95)');
  ashGrd.addColorStop(0.55, 'rgba(168, 162, 158, 0.45)');
  ashGrd.addColorStop(1, 'rgba(120, 113, 108, 0)');
  ashCtx.fillStyle = ashGrd;
  ashCtx.beginPath();
  ashCtx.moveTo(32, 8);
  ashCtx.lineTo(48, 18);
  ashCtx.lineTo(54, 36);
  ashCtx.lineTo(40, 52);
  ashCtx.lineTo(20, 50);
  ashCtx.lineTo(10, 32);
  ashCtx.lineTo(18, 14);
  ashCtx.closePath();
  ashCtx.fill();
  const ashMap = configureTexture(new THREE.CanvasTexture(ashC), 1, true, 1, 1);
  ashMap.wrapS = THREE.ClampToEdgeWrapping;
  ashMap.wrapT = THREE.ClampToEdgeWrapping;

  // 10. School worn institutional linoleum tile floor
  const [linC, linCtx] = makeCanvas(512, 512);
  const tileSize = 64;
  for (let ty = 0; ty < 8; ty++) {
    for (let tx = 0; tx < 8; tx++) {
      const alt = (tx + ty) % 2 === 0;
      const base = alt ? 44 : 33;
      const jitter = ((tx * 7 + ty * 13) % 7) - 3;
      linCtx.fillStyle = `rgb(${base + jitter}, ${base + 4 + jitter}, ${base + 2 + jitter})`;
      linCtx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
      // Tile border grout
      linCtx.strokeStyle = 'rgba(10, 12, 13, 0.72)';
      linCtx.lineWidth = 2;
      linCtx.strokeRect(tx * tileSize + 0.5, ty * tileSize + 0.5, tileSize - 1, tileSize - 1);
    }
  }
  // Scuff marks & dark stains
  for (let s = 0; s < 34; s++) {
    linCtx.strokeStyle = 'rgba(12, 12, 14, 0.38)';
    linCtx.lineWidth = 2 + Math.random() * 4;
    const sx = Math.random() * 512;
    const sy = Math.random() * 512;
    linCtx.beginPath();
    linCtx.moveTo(sx, sy);
    linCtx.lineTo(sx + (Math.random() - 0.5) * 42, sy + (Math.random() - 0.5) * 42);
    linCtx.stroke();
  }
  const linoleumMap = configureTexture(new THREE.CanvasTexture(linC), maxAniso, true, 2, 18);

  const [linRC, linRCtx] = makeCanvas(256, 256);
  linRCtx.fillStyle = '#686868';
  linRCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    linRCtx.fillStyle = i % 2 === 0 ? '#4d4d4d' : '#9c9c9c';
    linRCtx.fillRect(Math.random() * 230, Math.random() * 230, 24, 24);
  }
  const linoleumRoughness = configureTexture(new THREE.CanvasTexture(linRC), maxAniso, false, 2, 18);

  // 11. School institutional wall (peeling sage plaster + lower ceramic tile wainscoting)
  const [swC, swCtx] = makeCanvas(512, 512);
  // Upper institutional painted plaster
  swCtx.fillStyle = '#1e2725';
  swCtx.fillRect(0, 0, 512, 310);
  // Subtle peeling grime
  for (let d = 0; d < 24; d++) {
    const dx = Math.random() * 512;
    const dw = 12 + Math.random() * 34;
    const grd = swCtx.createLinearGradient(dx, 0, dx, 280);
    grd.addColorStop(0, 'rgba(8, 11, 10, 0.55)');
    grd.addColorStop(1, 'rgba(8, 11, 10, 0)');
    swCtx.fillStyle = grd;
    swCtx.fillRect(dx, 0, dw, 280);
  }
  // Divider rail
  swCtx.fillStyle = '#111615';
  swCtx.fillRect(0, 304, 512, 14);
  // Lower ceramic tile wainscoting
  swCtx.fillStyle = '#24302d';
  swCtx.fillRect(0, 318, 512, 194);
  swCtx.strokeStyle = 'rgba(10, 14, 13, 0.78)';
  swCtx.lineWidth = 2;
  for (let gx = 0; gx <= 512; gx += 32) {
    swCtx.beginPath();
    swCtx.moveTo(gx, 318);
    swCtx.lineTo(gx, 512);
    swCtx.stroke();
  }
  for (let gy = 318; gy <= 512; gy += 32) {
    swCtx.beginPath();
    swCtx.moveTo(0, gy);
    swCtx.lineTo(512, gy);
    swCtx.stroke();
  }
  const schoolWallMap = configureTexture(new THREE.CanvasTexture(swC), maxAniso, true, 16, 1);

  // 12. Dropped acoustic ceiling grid with water stains
  const [acC, acCtx] = makeCanvas(512, 512);
  acCtx.fillStyle = '#1a1d20';
  acCtx.fillRect(0, 0, 512, 512);
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const px = gx * 128;
      const py = gy * 128;
      const missing = gx === 2 && gy === 1;
      acCtx.fillStyle = missing ? '#060709' : '#23272b';
      acCtx.fillRect(px + 4, py + 4, 120, 120);
      if (!missing) {
        acCtx.fillStyle = 'rgba(10, 11, 12, 0.35)';
        for (let d = 0; d < 18; d++) {
          acCtx.fillRect(px + 10 + Math.random() * 105, py + 10 + Math.random() * 105, 3, 3);
        }
      }
    }
  }
  // Water stain patch
  const acGrd = acCtx.createRadialGradient(140, 320, 10, 140, 320, 110);
  acGrd.addColorStop(0, 'rgba(38, 28, 16, 0.55)');
  acGrd.addColorStop(1, 'rgba(38, 28, 16, 0)');
  acCtx.fillStyle = acGrd;
  acCtx.fillRect(20, 200, 240, 240);
  const acousticCeilingMap = configureTexture(new THREE.CanvasTexture(acC), maxAniso, true, 2, 16);

  // 13. Dusty dark-green chalkboard with unsettling Spanish chalk markings
  const [cbC, cbCtx] = makeCanvas(512, 256);
  cbCtx.fillStyle = '#10241b';
  cbCtx.fillRect(0, 0, 512, 256);
  // Chalk dust smears
  for (let s = 0; s < 16; s++) {
    const cx = Math.random() * 512;
    const cy = Math.random() * 256;
    const cg = cbCtx.createRadialGradient(cx, cy, 4, cx, cy, 55);
    cg.addColorStop(0, 'rgba(210, 224, 214, 0.14)');
    cg.addColorStop(1, 'rgba(210, 224, 214, 0)');
    cbCtx.fillStyle = cg;
    cbCtx.fillRect(cx - 55, cy - 55, 110, 110);
  }
  cbCtx.fillStyle = 'rgba(232, 240, 232, 0.72)';
  cbCtx.font = 'bold 28px Georgia, serif';
  cbCtx.fillText('NO MIRES ATRÁS', 42, 74);
  cbCtx.font = 'italic 20px Georgia, serif';
  cbCtx.fillStyle = 'rgba(220, 230, 222, 0.56)';
  cbCtx.fillText('¿Quién camina detrás de ti?', 52, 126);
  // Chalk tally marks
  cbCtx.strokeStyle = 'rgba(232, 240, 232, 0.65)';
  cbCtx.lineWidth = 3;
  for (let t = 0; t < 15; t++) {
    const tx = 65 + Math.floor(t / 5) * 65 + (t % 5) * 9;
    cbCtx.beginPath();
    cbCtx.moveTo(tx, 165);
    cbCtx.lineTo(tx, 205);
    cbCtx.stroke();
    if (t % 5 === 4) {
      cbCtx.beginPath();
      cbCtx.moveTo(tx - 40, 198);
      cbCtx.lineTo(tx + 5, 172);
      cbCtx.stroke();
    }
  }
  const chalkboardMap = configureTexture(new THREE.CanvasTexture(cbC), maxAniso, true, 1, 1);

  // 14. Weathered metal school locker face
  const [lkC, lkCtx] = makeCanvas(256, 512);
  lkCtx.fillStyle = '#25313d';
  lkCtx.fillRect(0, 0, 256, 512);
  lkCtx.strokeStyle = '#111820';
  lkCtx.lineWidth = 8;
  lkCtx.strokeRect(4, 4, 248, 504);
  // Recessed inner panel
  lkCtx.strokeStyle = '#334252';
  lkCtx.lineWidth = 3;
  lkCtx.strokeRect(18, 18, 220, 476);
  // Top & bottom louver vents
  lkCtx.fillStyle = '#0d1218';
  for (let v = 0; v < 5; v++) {
    lkCtx.fillRect(54, 48 + v * 15, 148, 7);
    lkCtx.fillRect(54, 405 + v * 15, 148, 7);
  }
  // Rust streaks
  const rustG = lkCtx.createLinearGradient(0, 120, 0, 360);
  rustG.addColorStop(0, 'rgba(92, 42, 18, 0.42)');
  rustG.addColorStop(1, 'rgba(92, 42, 18, 0)');
  lkCtx.fillStyle = rustG;
  lkCtx.fillRect(28, 120, 44, 240);
  const lockerMap = configureTexture(new THREE.CanvasTexture(lkC), maxAniso, true, 1, 1);

  // 15. Glowing TikTok-style vertical smartphone screen for La Casa bedroom cutscene
  const [ttC, ttCtx] = makeCanvas(180, 320);
  const ttBg = ttCtx.createLinearGradient(0, 0, 0, 320);
  ttBg.addColorStop(0, '#0f172a');
  ttBg.addColorStop(0.45, '#1e1035');
  ttBg.addColorStop(1, '#09090f');
  ttCtx.fillStyle = ttBg;
  ttCtx.fillRect(0, 0, 180, 320);
  // Stylized video frame silhouette / neon glow bars
  ttCtx.fillStyle = 'rgba(34, 211, 238, 0.25)';
  ttCtx.fillRect(26, 64, 112, 138);
  ttCtx.fillStyle = 'rgba(244, 63, 94, 0.32)';
  ttCtx.fillRect(34, 72, 108, 126);
  ttCtx.fillStyle = '#f8fafc';
  ttCtx.beginPath();
  ttCtx.arc(88, 118, 22, 0, Math.PI * 2);
  ttCtx.fill();
  ttCtx.fillStyle = '#0f172a';
  ttCtx.beginPath();
  ttCtx.moveTo(82, 108);
  ttCtx.lineTo(102, 118);
  ttCtx.lineTo(82, 128);
  ttCtx.closePath();
  ttCtx.fill();
  // Top tabs ("Siguiendo | Para ti")
  ttCtx.fillStyle = 'rgba(255,255,255,0.65)';
  ttCtx.font = 'bold 11px system-ui, sans-serif';
  ttCtx.fillText('Siguiendo   Para ti', 36, 28);
  ttCtx.fillStyle = '#ffffff';
  ttCtx.fillRect(102, 33, 34, 2.5);
  // Right sidebar social buttons (heart, comment, share, music disc)
  ttCtx.fillStyle = '#f43f5e';
  ttCtx.beginPath();
  ttCtx.arc(156, 174, 10, 0, Math.PI * 2);
  ttCtx.fill();
  ttCtx.fillStyle = '#e2e8f0';
  ttCtx.beginPath();
  ttCtx.arc(156, 206, 9, 0, Math.PI * 2);
  ttCtx.arc(156, 236, 9, 0, Math.PI * 2);
  ttCtx.fill();
  ttCtx.fillStyle = '#22d3ee';
  ttCtx.beginPath();
  ttCtx.arc(156, 270, 11, 0, Math.PI * 2);
  ttCtx.fill();
  // Bottom video caption lines & progress bar
  ttCtx.fillStyle = 'rgba(255,255,255,0.85)';
  ttCtx.fillRect(14, 266, 84, 7);
  ttCtx.fillStyle = 'rgba(255,255,255,0.45)';
  ttCtx.fillRect(14, 280, 110, 6);
  ttCtx.fillStyle = '#22d3ee';
  ttCtx.fillRect(0, 314, 116, 4);
  const tiktokScreenMap = configureTexture(new THREE.CanvasTexture(ttC), maxAniso, true, 1, 1);

  // 16. Stitched canvas blank face for La Prefecta Sin Rostro
  const [pfC, pfCtx] = makeCanvas(256, 256);
  pfCtx.fillStyle = '#8b8378';
  pfCtx.fillRect(0, 0, 256, 256);
  const pfGrd = pfCtx.createRadialGradient(128, 128, 30, 128, 128, 140);
  pfGrd.addColorStop(0, 'rgba(0,0,0,0)');
  pfGrd.addColorStop(1, 'rgba(18,14,12,0.68)');
  pfCtx.fillStyle = pfGrd;
  pfCtx.fillRect(0, 0, 256, 256);
  pfCtx.strokeStyle = '#141010';
  pfCtx.lineWidth = 4;
  // Cross-stitched blind seam across where eyes would be
  pfCtx.beginPath();
  pfCtx.moveTo(46, 104);
  pfCtx.lineTo(210, 104);
  pfCtx.stroke();
  for (let sx = 58; sx <= 198; sx += 18) {
    pfCtx.beginPath();
    pfCtx.moveTo(sx - 6, 92);
    pfCtx.lineTo(sx + 6, 116);
    pfCtx.moveTo(sx + 6, 92);
    pfCtx.lineTo(sx - 6, 116);
    pfCtx.stroke();
  }
  const prefectaFaceMap = configureTexture(new THREE.CanvasTexture(pfC), maxAniso, true, 1, 1);

  // 17. Chalk-dusted porcelain face for La Alumna de Tiza
  const [alC, alCtx] = makeCanvas(256, 256);
  alCtx.fillStyle = '#c8d2d0';
  alCtx.fillRect(0, 0, 256, 256);
  const alGrd = alCtx.createRadialGradient(128, 128, 25, 128, 128, 140);
  alGrd.addColorStop(0, 'rgba(255,255,255,0.18)');
  alGrd.addColorStop(1, 'rgba(12,18,22,0.72)');
  alCtx.fillStyle = alGrd;
  alCtx.fillRect(0, 0, 256, 256);
  // Cracked hollow cyan eyes
  alCtx.fillStyle = '#071217';
  alCtx.beginPath();
  alCtx.ellipse(86, 106, 20, 24, 0, 0, Math.PI * 2);
  alCtx.ellipse(170, 106, 20, 24, 0, 0, Math.PI * 2);
  alCtx.fill();
  alCtx.fillStyle = '#22d3ee';
  alCtx.beginPath();
  alCtx.arc(86, 106, 6, 0, Math.PI * 2);
  alCtx.arc(170, 106, 6, 0, Math.PI * 2);
  alCtx.fill();
  // Porcelain fracture cracks
  alCtx.strokeStyle = '#182428';
  alCtx.lineWidth = 3;
  alCtx.beginPath();
  alCtx.moveTo(128, 24);
  alCtx.lineTo(118, 78);
  alCtx.lineTo(136, 134);
  alCtx.lineTo(122, 188);
  alCtx.stroke();
  const alumnaFaceMap = configureTexture(new THREE.CanvasTexture(alC), maxAniso, true, 1, 1);

  return {
    woodMap,
    woodRoughness,
    wallpaperMap,
    ceilingMap,
    hazardMap,
    irisMap,
    maskMap,
    exitSignMap,
    glowMap,
    ashMap,
    linoleumMap,
    linoleumRoughness,
    schoolWallMap,
    acousticCeilingMap,
    chalkboardMap,
    lockerMap,
    tiktokScreenMap,
    prefectaFaceMap,
    alumnaFaceMap,
    dispose: () => {
      woodMap.dispose();
      woodRoughness.dispose();
      wallpaperMap.dispose();
      ceilingMap.dispose();
      hazardMap.dispose();
      irisMap.dispose();
      maskMap.dispose();
      exitSignMap.dispose();
      glowMap.dispose();
      ashMap.dispose();
      linoleumMap.dispose();
      linoleumRoughness.dispose();
      schoolWallMap.dispose();
      acousticCeilingMap.dispose();
      chalkboardMap.dispose();
      lockerMap.dispose();
      tiktokScreenMap.dispose();
      prefectaFaceMap.dispose();
      alumnaFaceMap.dispose();
    },
  };
}
