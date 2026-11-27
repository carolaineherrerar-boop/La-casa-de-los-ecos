export type GamePhase =
  | 'title'
  | 'cutscene'
  | 'intro'
  | 'playing'
  | 'jumpscare'
  | 'victory'
  | 'defeat';

export type AnomalyKind =
  | 'sombra'
  | 'ojo'
  | 'figura'
  | 'prefecta'
  | 'alumna'
  | 'campana';

export type MapId = 'casa' | 'escuela';

export type DifficultyId = 'facil' | 'normal' | 'dificil';

export type GraphicsQuality = 'baja' | 'media' | 'alta';

export interface GraphicsQualityOption {
  id: GraphicsQuality;
  label: string;
  description: string;
}

export const GRAPHICS_QUALITY_OPTIONS: GraphicsQualityOption[] = [
  {
    id: 'baja',
    label: 'Baja',
    description: 'Máximo FPS · Sin sombras dinámicas, niebla ligera y partículas reducidas',
  },
  {
    id: 'media',
    label: 'Media',
    description: 'Equilibrio fluido · Sombras suaves 512px y densidad atmosférica media',
  },
  {
    id: 'alta',
    label: 'Alta',
    description: 'Máximo detalle · Sombras 1024px, partículas densas e iluminación completa',
  },
];

export interface GameSettings {
  graphicsQuality: GraphicsQuality;
  sensitivity: number; // 0.4..2.0
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  graphicsQuality: 'alta',
  sensitivity: 1.0,
  musicVolume: 0.85,
  sfxVolume: 1.0,
};

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  summary: string;
  batteryDrainPerSec: number;
  batteryCount: number;
  batteryPickupAmount: number;
  anomalyCount: number;
  creepMultiplier: number;
  dissolveMultiplier: number;
  walkSpeedNormal: number;
  walkSpeedThreat: number;
  campanaDrainPerSec: number;
}

export const DIFFICULTY_OPTIONS: DifficultyConfig[] = [
  {
    id: 'facil',
    label: 'Fácil',
    summary: 'Batería duradera, más pilas y amenazas más lentas',
    batteryDrainPerSec: 1.45,
    batteryCount: 14,
    batteryPickupAmount: 32,
    anomalyCount: 9,
    creepMultiplier: 0.72,
    dissolveMultiplier: 1.32,
    walkSpeedNormal: 3.3,
    walkSpeedThreat: 2.1,
    campanaDrainPerSec: 2.2,
  },
  {
    id: 'normal',
    label: 'Normal',
    summary: 'Ritmo equilibrado de tensión, batería y anomalías',
    batteryDrainPerSec: 2.35,
    batteryCount: 11,
    batteryPickupAmount: 26,
    anomalyCount: 11,
    creepMultiplier: 1.0,
    dissolveMultiplier: 1.0,
    walkSpeedNormal: 3.45,
    walkSpeedThreat: 2.25,
    campanaDrainPerSec: 3.6,
  },
  {
    id: 'dificil',
    label: 'Difícil',
    summary: 'Consumo rápido, más anomalías y persecución agresiva',
    batteryDrainPerSec: 3.3,
    batteryCount: 9,
    batteryPickupAmount: 22,
    anomalyCount: 14,
    creepMultiplier: 1.35,
    dissolveMultiplier: 0.76,
    walkSpeedNormal: 3.75,
    walkSpeedThreat: 2.5,
    campanaDrainPerSec: 5.2,
  },
];

export function getDifficultyConfig(id: DifficultyId): DifficultyConfig {
  return DIFFICULTY_OPTIONS.find((d) => d.id === id) ?? DIFFICULTY_OPTIONS[1];
}

export interface MapMetadata {
  id: MapId;
  name: string;
  sectorLabel: string;
  description: string;
  unlockHint: string;
  threatsLabel: string;
}

export const GAME_MAPS: MapMetadata[] = [
  {
    id: 'casa',
    name: 'La Casa',
    sectorLabel: 'Cinta 04 · Sector Residencial',
    description: 'Pasillos estrechos de madera crujiente, puertas entreabiertas y sótano olvidado.',
    unlockHint: 'Disponible desde el inicio',
    threatsLabel: 'Sombra Acechante · Ojo Vigilante · Figura Errante',
  },
  {
    id: 'escuela',
    name: 'La Escuela',
    sectorLabel: 'Cinta 07 · Pabellón Escolar',
    description: 'Aulas oscuras con pupitres, pizarras marcadas y corredores de casilleros oxidados.',
    unlockHint: 'Completa La Casa para desbloquear',
    threatsLabel: 'La Prefecta Sin Rostro · La Alumna de Tiza · La Campana Maldita',
  },
];

export interface HudSnapshot {
  phase: GamePhase;
  paused: boolean;
  mapId: MapId;
  difficulty: DifficultyId;
  battery: number; // 0..100
  progress: number; // 0..100
  batteriesCollected: number;
  anomaliesDefeated: number;
  pulseCooldown: number; // 0..1 (0 = ready)
  activeTarget: {
    kind: AnomalyKind | null;
    label: string;
    subLabel: string;
    charge: number; // 0..1 progress
  };
  hintText: string | null;
  hintTitle: string | null;
  subtitleSpeaker: string | null;
  subtitleText: string | null;
  defeatedBy: AnomalyKind | null;
  defeatReason: string;
  elapsedSeconds: number;
  damageFlash: number; // 0..1
  pulseFlash: number; // 0..1
  jumpscareFlash: number; // 0..1
  introFadeOpacity: number; // 1 -> 0 during intro/cutscene fade
}

export type PerformanceRank = 'S' | 'A' | 'B' | 'C' | 'D';

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  mapId: MapId;
  difficulty: DifficultyId;
  completed: boolean;
  progress: number;
  elapsedSeconds: number;
  batteriesCollected: number;
  anomaliesDefeated: number;
  score: number;
  rank: PerformanceRank;
  createdAt: number;
}

export function computeRunPerformance(params: {
  difficulty: DifficultyId;
  completed: boolean;
  progress: number;
  elapsedSeconds: number;
  batteriesCollected: number;
  anomaliesDefeated: number;
}): { score: number; rank: PerformanceRank } {
  const diffMult =
    params.difficulty === 'dificil' ? 1.75 : params.difficulty === 'normal' ? 1.35 : 1.0;

  const base = params.completed ? 2000 : params.progress * 11;
  const speedBonus = params.completed ? Math.max(0, 120 - params.elapsedSeconds) * 14 : 0;
  const actionBonus = params.anomaliesDefeated * 70 + params.batteriesCollected * 25;
  const score = Math.round((base + speedBonus + actionBonus) * diffMult);

  let rank: PerformanceRank = 'D';
  if (params.completed) {
    if (score >= 4100) rank = 'S';
    else if (score >= 3100) rank = 'A';
    else if (score >= 2200) rank = 'B';
    else rank = 'C';
  } else if (params.progress >= 70) {
    rank = 'C';
  }

  return { score, rank };
}

export const ANOMALY_NAMES: Record<AnomalyKind, string> = {
  sombra: 'Sombra Acechante',
  ojo: 'Ojo Vigilante',
  figura: 'Figura Errante',
  prefecta: 'La Prefecta Sin Rostro',
  alumna: 'La Alumna de Tiza',
  campana: 'La Campana Maldita',
};

export const ANOMALY_HINTS: Record<AnomalyKind, string> = {
  sombra: 'Mantén el haz de la linterna fijo sobre la sombra hasta disolverla.',
  ojo: 'Usa el botón Pulso (o Espacio / doble toque) mientras apuntas al ojo para romperlo.',
  figura: 'Ilumínala con la linterna y tócala o haz clic directamente sobre ella antes de que se acerque.',
  prefecta: 'No la alumbres de frente: aparta la linterna y esquívala por el lado contrario.',
  alumna: 'Ilumínala con la linterna y tócala 3 veces rápido para quebrar su cuerpo de tiza.',
  campana: 'Su repique drena tu batería: apúntale y usa Pulso de luz para callarla.',
};
