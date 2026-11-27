import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Flame,
  Home,
  Lock,
  LogIn,
  MapPin,
  Monitor,
  Music,
  Pause,
  Play,
  RotateCcw,
  School,
  Settings,
  SkipForward,
  Skull,
  Sparkles,
  Trash2,
  Trophy,
  User,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { HorrorEngine } from './game/HorrorEngine';
import {
  ANOMALY_NAMES,
  DEFAULT_GAME_SETTINGS,
  DIFFICULTY_OPTIONS,
  GAME_MAPS,
  GRAPHICS_QUALITY_OPTIONS,
  computeRunPerformance,
  getDifficultyConfig,
  type DifficultyId,
  type GameSettings,
  type GraphicsQuality,
  type HudSnapshot,
  type LeaderboardEntry,
  type MapId,
  type PerformanceRank,
} from './game/types';

const STORAGE_SENSITIVITY_KEY = 'ecos_sensitivity';
const STORAGE_SETTINGS_KEY = 'ecos_settings_v1';
const STORAGE_ESCUELA_UNLOCKED_KEY = 'ecos_escuela_unlocked';
const STORAGE_SELECTED_MAP_KEY = 'ecos_selected_map';
const STORAGE_DIFFICULTY_PREFIX = 'ecos_difficulty_';
const STORAGE_PLAYER_NAME_KEY = 'ecos_player_name';
const STORAGE_LEADERBOARD_KEY = 'ecos_leaderboard_v1';

function isDifficultyId(val: string | null): val is DifficultyId {
  return val === 'facil' || val === 'normal' || val === 'dificil';
}

function isGraphicsQuality(val: unknown): val is GraphicsQuality {
  return val === 'baja' || val === 'media' || val === 'alta';
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function loadGameSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        graphicsQuality: isGraphicsQuality(parsed.graphicsQuality)
          ? parsed.graphicsQuality
          : DEFAULT_GAME_SETTINGS.graphicsQuality,
        sensitivity:
          typeof parsed.sensitivity === 'number' && Number.isFinite(parsed.sensitivity)
            ? clamp(parsed.sensitivity, 0.4, 2.0)
            : DEFAULT_GAME_SETTINGS.sensitivity,
        musicVolume:
          typeof parsed.musicVolume === 'number' && Number.isFinite(parsed.musicVolume)
            ? clamp(parsed.musicVolume, 0, 1)
            : DEFAULT_GAME_SETTINGS.musicVolume,
        sfxVolume:
          typeof parsed.sfxVolume === 'number' && Number.isFinite(parsed.sfxVolume)
            ? clamp(parsed.sfxVolume, 0, 1)
            : DEFAULT_GAME_SETTINGS.sfxVolume,
      };
    }

    const legacySens = localStorage.getItem(STORAGE_SENSITIVITY_KEY);
    const parsedSens = legacySens ? parseFloat(legacySens) : NaN;
    return {
      ...DEFAULT_GAME_SETTINGS,
      sensitivity: Number.isFinite(parsedSens)
        ? clamp(parsedSens, 0.4, 2.0)
        : DEFAULT_GAME_SETTINGS.sensitivity,
    };
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

function saveGameSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(STORAGE_SENSITIVITY_KEY, String(settings.sensitivity));
  } catch {
    // Ignore storage failures in private iframes
  }
}

function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.completed !== a.completed) return a.completed ? -1 : 1;
    if (b.progress !== a.progress) return b.progress - a.progress;
    if (a.elapsedSeconds !== b.elapsedSeconds) return a.elapsedSeconds - b.elapsedSeconds;
    return b.createdAt - a.createdAt;
  });
}

function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_LEADERBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (item): item is LeaderboardEntry =>
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.playerName === 'string' &&
        (item.mapId === 'casa' || item.mapId === 'escuela') &&
        isDifficultyId(item.difficulty) &&
        typeof item.score === 'number',
    );
    return sortLeaderboard(valid).slice(0, 50);
  } catch {
    return [];
  }
}

function saveLeaderboard(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 50)));
  } catch {
    // Ignore storage errors in private iframes
  }
}

function getRankBadgeClass(rank: PerformanceRank): string {
  switch (rank) {
    case 'S':
      return 'border-[#f5b800] bg-[#f5b800]/20 text-[#ffd748]';
    case 'A':
      return 'border-[#10f5c8] bg-[#10f5c8]/20 text-[#10f5c8]';
    case 'B':
      return 'border-[#38bdf8] bg-[#38bdf8]/20 text-[#7dd3fc]';
    case 'C':
      return 'border-[#a8a59e] bg-white/10 text-[#e5e2da]';
    default:
      return 'border-[#e11d48]/60 bg-[#e11d48]/15 text-[#fb7185]';
  }
}

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  paused: false,
  mapId: 'casa',
  difficulty: 'normal',
  battery: 100,
  progress: 0,
  batteriesCollected: 0,
  anomaliesDefeated: 0,
  pulseCooldown: 0,
  activeTarget: { kind: null, label: '', subLabel: '', charge: 0 },
  hintTitle: null,
  hintText: null,
  subtitleSpeaker: null,
  subtitleText: null,
  defeatedBy: null,
  defeatReason: '',
  elapsedSeconds: 0,
  damageFlash: 0,
  pulseFlash: 0,
  jumpscareFlash: 0,
  introFadeOpacity: 0,
};

function formatTimeEs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<HorrorEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState(false);

  const [escuelaUnlocked, setEscuelaUnlocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_ESCUELA_UNLOCKED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [selectedMap, setSelectedMap] = useState<MapId>(() => {
    try {
      const unlocked = localStorage.getItem(STORAGE_ESCUELA_UNLOCKED_KEY) === 'true';
      const saved = localStorage.getItem(STORAGE_SELECTED_MAP_KEY);
      if (saved === 'escuela' && unlocked) return 'escuela';
      return 'casa';
    } catch {
      return 'casa';
    }
  });

  const [mapDifficulties, setMapDifficulties] = useState<Record<MapId, DifficultyId>>(() => {
    try {
      const casa = localStorage.getItem(`${STORAGE_DIFFICULTY_PREFIX}casa`);
      const escuela = localStorage.getItem(`${STORAGE_DIFFICULTY_PREFIX}escuela`);
      return {
        casa: isDifficultyId(casa) ? casa : 'normal',
        escuela: isDifficultyId(escuela) ? escuela : 'normal',
      };
    } catch {
      return { casa: 'normal', escuela: 'normal' };
    }
  });

  const [justUnlockedEscuela, setJustUnlockedEscuela] = useState(false);

  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_PLAYER_NAME_KEY)?.trim() ?? '';
    } catch {
      return '';
    }
  });
  const [isEditingName, setIsEditingName] = useState<boolean>(() => {
    try {
      return !(localStorage.getItem(STORAGE_PLAYER_NAME_KEY)?.trim());
    } catch {
      return true;
    }
  });
  const [nameInput, setNameInput] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_PLAYER_NAME_KEY)?.trim() ?? '';
    } catch {
      return '';
    }
  });
  const [nameError, setNameError] = useState<string | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => loadLeaderboard());
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardFilter, setLeaderboardFilter] = useState<'all' | MapId>('all');
  const [confirmClearBoard, setConfirmClearBoard] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<{
    entryId: string;
    score: number;
    rank: PerformanceRank;
  } | null>(null);
  const runRecordedRef = useRef(false);

  const [settings, setSettings] = useState<GameSettings>(() => loadGameSettings());
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new HorrorEngine(
      mount,
      (snapshot) => {
        setHud(snapshot);
      },
      selectedMap,
      mapDifficulties[selectedMap],
    );
    engine.setSensitivity(settings.sensitivity);
    engine.setGraphicsQuality(settings.graphicsQuality);
    engine.audio.setMusicVolume(settings.musicVolume);
    engine.audio.setSfxVolume(settings.sfxVolume);
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Automatically save progression in localStorage when La Casa is completed
  useEffect(() => {
    if (hud.phase === 'victory' && hud.mapId === 'casa') {
      if (!escuelaUnlocked) {
        setEscuelaUnlocked(true);
        setJustUnlockedEscuela(true);
      }
      try {
        localStorage.setItem(STORAGE_ESCUELA_UNLOCKED_KEY, 'true');
      } catch {
        // Ignore storage failures in private iframes
      }
    }
  }, [hud.phase, hud.mapId, escuelaUnlocked]);

  // Record finished runs once to the Spanish localStorage leaderboard
  useEffect(() => {
    if (hud.phase === 'cutscene' || hud.phase === 'intro' || hud.phase === 'playing') {
      runRecordedRef.current = false;
      setLastRunResult(null);
      return;
    }

    if ((hud.phase === 'victory' || hud.phase === 'defeat') && !runRecordedRef.current) {
      runRecordedRef.current = true;
      const completed = hud.phase === 'victory';
      const effectiveProgress = completed ? 100 : hud.progress;
      const perf = computeRunPerformance({
        difficulty: hud.difficulty,
        completed,
        progress: effectiveProgress,
        elapsedSeconds: hud.elapsedSeconds,
        batteriesCollected: hud.batteriesCollected,
        anomaliesDefeated: hud.anomaliesDefeated,
      });

      const entry: LeaderboardEntry = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        playerName: playerName || 'Jugador',
        mapId: hud.mapId,
        difficulty: hud.difficulty,
        completed,
        progress: effectiveProgress,
        elapsedSeconds: hud.elapsedSeconds,
        batteriesCollected: hud.batteriesCollected,
        anomaliesDefeated: hud.anomaliesDefeated,
        score: perf.score,
        rank: perf.rank,
        createdAt: Date.now(),
      };

      setLastRunResult({ entryId: entry.id, score: perf.score, rank: perf.rank });
      setLeaderboard((prev) => {
        const next = sortLeaderboard([entry, ...prev]).slice(0, 50);
        saveLeaderboard(next);
        return next;
      });
    }
  }, [
    hud.phase,
    hud.mapId,
    hud.difficulty,
    hud.progress,
    hud.elapsedSeconds,
    hud.batteriesCollected,
    hud.anomaliesDefeated,
    playerName,
  ]);

  const handleSubmitName = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = nameInput.trim();
      if (!trimmed) {
        setNameError('Escribe un apodo para continuar.');
        return;
      }
      const cleanName = trimmed.slice(0, 18);
      setPlayerName(cleanName);
      setNameInput(cleanName);
      setNameError(null);
      setIsEditingName(false);
      engineRef.current?.audio.unlock();
      engineRef.current?.audio.playFlashlightClick();
      try {
        localStorage.setItem(STORAGE_PLAYER_NAME_KEY, cleanName);
      } catch {
        // Ignore storage errors
      }
    },
    [nameInput],
  );

  const handleOpenEditName = useCallback(() => {
    setNameInput(playerName);
    setNameError(null);
    setIsEditingName(true);
  }, [playerName]);

  const handleCancelEditName = useCallback(() => {
    if (!playerName) return;
    setNameError(null);
    setIsEditingName(false);
  }, [playerName]);

  const handleOpenLeaderboard = useCallback((filter: 'all' | MapId = 'all') => {
    setLeaderboardFilter(filter);
    setConfirmClearBoard(false);
    setShowLeaderboard(true);
    engineRef.current?.audio.unlock();
    engineRef.current?.audio.playFlashlightClick();
  }, []);

  const handleClearLeaderboard = useCallback(() => {
    if (!confirmClearBoard) {
      setConfirmClearBoard(true);
      return;
    }
    setLeaderboard([]);
    setConfirmClearBoard(false);
    try {
      localStorage.removeItem(STORAGE_LEADERBOARD_KEY);
    } catch {
      // Ignore storage errors
    }
  }, [confirmClearBoard]);

  const handleSelectMap = useCallback(
    (mapId: MapId) => {
      if (mapId === 'escuela' && !escuelaUnlocked) return;
      setSelectedMap(mapId);
      engineRef.current?.audio.unlock();
      engineRef.current?.audio.playFlashlightClick();
      engineRef.current?.setDifficulty(mapDifficulties[mapId]);
      engineRef.current?.setMap(mapId);
      try {
        localStorage.setItem(STORAGE_SELECTED_MAP_KEY, mapId);
      } catch {
        // Ignore storage errors
      }
    },
    [escuelaUnlocked, mapDifficulties],
  );

  const handleSelectDifficulty = useCallback(
    (mapId: MapId, diff: DifficultyId) => {
      if (mapId === 'escuela' && !escuelaUnlocked) return;
      setMapDifficulties((prev) => ({ ...prev, [mapId]: diff }));
      setSelectedMap(mapId);
      engineRef.current?.audio.unlock();
      engineRef.current?.audio.playFlashlightClick();
      engineRef.current?.setDifficulty(diff);
      engineRef.current?.setMap(mapId);
      try {
        localStorage.setItem(`${STORAGE_DIFFICULTY_PREFIX}${mapId}`, diff);
        localStorage.setItem(STORAGE_SELECTED_MAP_KEY, mapId);
      } catch {
        // Ignore storage errors
      }
    },
    [escuelaUnlocked],
  );

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next: GameSettings = {
        ...prev,
        ...patch,
      };
      saveGameSettings(next);
      const eng = engineRef.current;
      if (eng) {
        eng.setSensitivity(next.sensitivity);
        eng.setGraphicsQuality(next.graphicsQuality);
        eng.audio.setMusicVolume(next.musicVolume);
        eng.audio.setSfxVolume(next.sfxVolume);
      }
      return next;
    });
  }, []);

  const handleResetSettings = useCallback(() => {
    engineRef.current?.audio.unlock();
    engineRef.current?.audio.playFlashlightClick();
    updateSettings(DEFAULT_GAME_SETTINGS);
  }, [updateSettings]);

  const handleOpenSettings = useCallback(() => {
    engineRef.current?.audio.unlock();
    engineRef.current?.audio.playFlashlightClick();
    setShowLeaderboard(false);
    if (hud.phase === 'playing' || hud.phase === 'cutscene' || hud.phase === 'intro') {
      engineRef.current?.setPaused(true);
    }
    setShowSettings(true);
  }, [hud.phase]);

  const handleCloseSettings = useCallback(() => {
    engineRef.current?.audio.playFlashlightClick();
    setShowSettings(false);
    if (hud.phase === 'playing' || hud.phase === 'cutscene' || hud.phase === 'intro') {
      engineRef.current?.setPaused(false);
    }
  }, [hud.phase]);

  const handleStart = useCallback(() => {
    if (!playerName || isEditingName) return;
    setShowLeaderboard(false);
    setShowSettings(false);
    setJustUnlockedEscuela(false);
    engineRef.current?.setDifficulty(mapDifficulties[selectedMap]);
    engineRef.current?.setMap(selectedMap);
    engineRef.current?.startGame();
  }, [playerName, isEditingName, selectedMap, mapDifficulties]);

  const handleSkipCutscene = useCallback(() => {
    engineRef.current?.skipCutscene();
  }, []);

  const handleReturnToMenu = useCallback(() => {
    setJustUnlockedEscuela(false);
    setShowLeaderboard(false);
    setShowSettings(false);
    engineRef.current?.returnToTitle();
  }, []);

  const handleToggleMute = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.audio.unlock();
    const next = !eng.audio.isMuted();
    eng.audio.setMuted(next);
    setMuted(next);
  }, []);

  const handlePulse = useCallback(() => {
    engineRef.current?.triggerFlashlightPulse();
  }, []);

  const handleSteer = useCallback((dir: -1 | 0 | 1) => {
    engineRef.current?.setSteerHold(dir);
  }, []);

  // Keyboard shortcuts: Escape/P for pause/settings during runs, Escape to close modals, Enter/Space on menus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (showSettings) {
          e.preventDefault();
          handleCloseSettings();
          return;
        }
        if (showLeaderboard) {
          e.preventDefault();
          setShowLeaderboard(false);
          return;
        }
      }

      if (
        (hud.phase === 'playing' || hud.phase === 'cutscene' || hud.phase === 'intro') &&
        (e.code === 'Escape' || e.code === 'KeyP')
      ) {
        e.preventDefault();
        if (showSettings) {
          handleCloseSettings();
        } else {
          handleOpenSettings();
        }
        return;
      }

      if (
        !playerName ||
        isEditingName ||
        showLeaderboard ||
        showSettings ||
        hud.phase === 'cutscene' ||
        hud.phase === 'intro' ||
        hud.phase === 'playing' ||
        hud.phase === 'jumpscare'
      ) {
        return;
      }
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'BUTTON') return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    hud.phase,
    playerName,
    isEditingName,
    showLeaderboard,
    showSettings,
    handleStart,
    handleOpenSettings,
    handleCloseSettings,
  ]);

  const batteryColor =
    hud.battery > 45
      ? '#10f5c8'
      : hud.battery > 20
        ? '#f5b800'
        : '#ef4444';

  const pulseReady = hud.pulseCooldown <= 0.01 && hud.battery > 1;
  const activeMapMeta = GAME_MAPS.find((m) => m.id === selectedMap) ?? GAME_MAPS[0];
  const hudMapMeta = GAME_MAPS.find((m) => m.id === hud.mapId) ?? GAME_MAPS[0];
  const activeDiffCfg = getDifficultyConfig(mapDifficulties[selectedMap]);
  const hudDiffCfg = getDifficultyConfig(hud.difficulty);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050507] text-[#f4f1ea]">
      {/* Isolated WebGL Canvas Mount */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {/* Subtle Horror Vignette & Pulse / Damage Edge Flashes (pointer-events-none) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at center, rgba(0,0,0,0) 46%, rgba(3,4,7,0.82) 100%)',
        }}
      />
      {hud.pulseFlash > 0.02 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at center, rgba(205,248,255,${hud.pulseFlash * 0.28}) 0%, rgba(0,0,0,0) 70%)`,
          }}
        />
      )}
      {hud.damageFlash > 0.02 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at center, rgba(0,0,0,0) 26%, rgba(220,24,42,${hud.damageFlash * 0.72}) 100%)`,
          }}
        />
      )}
      {hud.phase === 'jumpscare' && hud.jumpscareFlash > 0.02 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at center, rgba(255,255,255,${hud.jumpscareFlash * 0.2}) 0%, rgba(225,29,72,${hud.jumpscareFlash * 0.38}) 68%, rgba(0,0,0,0.65) 100%)`,
          }}
        />
      )}

      {/* ==================== NICKNAME LOGIN / CHANGE PLAYER NAME SCREEN ==================== */}
      {hud.phase === 'title' && (!playerName || isEditingName) && (
        <div className="absolute inset-0 z-30 flex flex-col justify-between overflow-y-auto bg-[#05060a]/82 p-4 sm:p-7">
          <div className="pointer-events-none scanlines-overlay absolute inset-0 opacity-50" />

          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 border border-[#f5b800]/40 bg-[#0b0c10]/94 px-3.5 py-2">
              <span className="inline-block h-3 w-3 bg-[#e11d48]" />
              <span className="text-xs font-bold tracking-[0.22em] text-[#f5b800] uppercase">
                La Casa de los Ecos · Acceso
              </span>
            </div>

            <button
              type="button"
              onClick={handleToggleMute}
              className="flex cursor-pointer items-center gap-2 border border-white/20 bg-[#0b0c10]/94 px-4 py-2 text-xs font-bold tracking-widest text-[#f4f1ea] uppercase transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
            >
              {muted ? <VolumeX className="h-4 w-4 text-[#e11d48]" /> : <Volume2 className="h-4 w-4 text-[#10f5c8]" />}
              <span>{muted ? 'Activar sonido' : 'Silenciar'}</span>
            </button>
          </div>

          <div className="relative z-10 mx-auto my-auto w-full max-w-md border-2 border-[#f5b800]/80 bg-[#090a0f]/96 shadow-2xl">
            <div className="hazard-stripes h-2 w-full opacity-90" />
            <form onSubmit={handleSubmitName} className="p-6 sm:p-7">
              <div className="mb-3 inline-flex items-center gap-2 bg-[#e11d48] px-3 py-1 text-[11px] font-black tracking-[0.22em] text-white uppercase">
                <User className="h-3.5 w-3.5" />
                <span>{playerName ? 'Cambiar apodo' : 'Registro de jugador'}</span>
              </div>

              <h1 className="text-2xl font-black tracking-wide text-white uppercase sm:text-3xl">
                {playerName ? 'Actualiza tu nombre' : '¿Quién entra en la oscuridad?'}
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-[#c4c1b8]">
                Ingresa cualquier apodo para identificarte en la tabla de clasificación de La Casa y
                La Escuela.
              </p>

              <div className="mt-5">
                <label
                  htmlFor="player-nickname-input"
                  className="mb-1.5 block text-[11px] font-extrabold tracking-[0.18em] text-[#f5b800] uppercase"
                >
                  Nombre o apodo (máx. 18 caracteres)
                </label>
                <input
                  id="player-nickname-input"
                  type="text"
                  maxLength={18}
                  autoFocus
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="Ej. Explorador_04"
                  className="w-full border border-white/25 bg-[#0e1017] px-4 py-3 text-base font-bold text-white placeholder-[#6b6860] outline-none transition-colors focus:border-[#f5b800]"
                />
                {nameError && (
                  <p className="mt-1.5 text-xs font-bold text-[#fb7185]">{nameError}</p>
                )}
              </div>

              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="submit"
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 border-2 border-[#f5b800] bg-[#f5b800] px-5 py-3 text-sm font-black tracking-[0.18em] text-[#08090c] uppercase transition-colors hover:bg-[#ffd038]"
                >
                  <LogIn className="h-4 w-4" />
                  <span>{playerName ? 'Guardar nombre' : 'Entrar al menú'}</span>
                </button>

                {playerName && (
                  <button
                    type="button"
                    onClick={handleCancelEditName}
                    className="flex cursor-pointer items-center justify-center border border-white/20 bg-[#12141c] px-4 py-3 text-xs font-extrabold tracking-[0.16em] text-[#d4d1c9] uppercase transition-colors hover:border-white/50 hover:text-white"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="relative z-10 text-center text-[11px] font-semibold tracking-[0.16em] text-[#8f8c84] uppercase">
            Tu progreso y récords se guardan localmente en este navegador
          </div>
        </div>
      )}

      {/* ==================== TITLE SCREEN (POPPY PLAYTIME INDUSTRIAL HORROR) ==================== */}
      {hud.phase === 'title' && playerName && !isEditingName && (
        <div className="absolute inset-0 z-20 flex flex-col justify-between overflow-y-auto p-4 sm:p-7">
          <div className="pointer-events-none scanlines-overlay absolute inset-0 opacity-50" />

          {/* Top Industrial Bar */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 border border-[#f5b800]/40 bg-[#0b0c10]/92 px-3.5 py-2">
              <span className="inline-block h-3 w-3 bg-[#e11d48]" />
              <span className="text-xs font-bold tracking-[0.22em] text-[#f5b800] uppercase">
                {activeMapMeta.sectorLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 border border-white/15 bg-[#0b0c10]/92 px-3 py-2 text-xs">
                <User className="h-3.5 w-3.5 text-[#10f5c8]" />
                <span className="font-black tracking-wider text-white">{playerName}</span>
                <button
                  type="button"
                  onClick={handleOpenEditName}
                  className="ml-1 inline-flex cursor-pointer items-center gap-1 border border-white/20 bg-[#141720] px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-[#f5b800] uppercase transition-colors hover:border-[#f5b800] hover:bg-[#1f1a0c]"
                >
                  <Edit3 className="h-3 w-3" />
                  <span>Cambiar</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleOpenLeaderboard('all')}
                className="flex cursor-pointer items-center gap-2 border border-[#f5b800]/45 bg-[#0b0c10]/92 px-3.5 py-2 text-xs font-bold tracking-widest text-[#f5b800] uppercase transition-colors hover:border-[#f5b800] hover:bg-[#171308]"
              >
                <Trophy className="h-4 w-4" />
                <span>Clasificación</span>
                {leaderboard.length > 0 && (
                  <span className="bg-[#f5b800]/20 px-1.5 py-0.5 text-[10px] font-black text-[#ffd038]">
                    {leaderboard.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenSettings}
                className="flex cursor-pointer items-center gap-2 border border-white/25 bg-[#0b0c10]/92 px-3.5 py-2 text-xs font-bold tracking-widest text-[#f4f1ea] uppercase transition-colors hover:border-[#10f5c8] hover:text-[#10f5c8]"
              >
                <Settings className="h-4 w-4 text-[#10f5c8]" />
                <span>Ajustes</span>
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                className="flex cursor-pointer items-center gap-2 border border-white/20 bg-[#0b0c10]/92 px-4 py-2 text-xs font-bold tracking-widest text-[#f4f1ea] uppercase transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
              >
                {muted ? <VolumeX className="h-4 w-4 text-[#e11d48]" /> : <Volume2 className="h-4 w-4 text-[#10f5c8]" />}
                <span>{muted ? 'Activar sonido' : 'Silenciar'}</span>
              </button>
            </div>
          </div>

          {/* Main Title Content + Mapas Selection */}
          <div className="relative z-10 my-auto flex flex-col gap-5 py-3 lg:flex-row lg:items-end lg:justify-between">
            {/* Left Lockup & Action */}
            <div className="max-w-xl">
              <div className="mb-2.5 inline-flex items-center gap-2 bg-[#e11d48] px-3 py-1 text-[11px] font-black tracking-[0.24em] text-white uppercase">
                <Eye className="h-3.5 w-3.5" />
                <span>Terror Psicológico 3D</span>
              </div>

              {/* Bespoke SVG Title Lockup */}
              <div className="title-flicker mb-3">
                <svg
                  viewBox="0 0 640 168"
                  className="w-full max-w-[490px] drop-shadow-[0_10px_28px_rgba(0,0,0,0.95)]"
                  role="img"
                  aria-label="La Casa de los Ecos"
                >
                  <defs>
                    <linearGradient id="titleMetal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fff7d6" />
                      <stop offset="52%" stopColor="#f5b800" />
                      <stop offset="100%" stopColor="#b45309" />
                    </linearGradient>
                    <linearGradient id="crimsonSub" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f43f5e" />
                      <stop offset="100%" stopColor="#be123c" />
                    </linearGradient>
                  </defs>
                  <rect x="0" y="10" width="8" height="145" fill="#f5b800" />
                  <text
                    x="24"
                    y="54"
                    fill="#f4f1ea"
                    fontSize="34"
                    fontWeight="900"
                    letterSpacing="8"
                    fontFamily="system-ui, sans-serif"
                  >
                    LA CASA DE LOS
                  </text>
                  <text
                    x="20"
                    y="142"
                    fill="url(#titleMetal)"
                    fontSize="106"
                    fontWeight="950"
                    letterSpacing="6"
                    fontFamily="system-ui, sans-serif"
                  >
                    ECOS
                  </text>
                  <rect x="330" y="96" width="290" height="28" fill="url(#crimsonSub)" opacity="0.92" />
                  <text
                    x="475"
                    y="115"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="14"
                    fontWeight="900"
                    letterSpacing="4"
                    fontFamily="system-ui, sans-serif"
                  >
                    NO APAGUES LA LINTERNA
                  </text>
                </svg>
              </div>

              <p className="mb-5 max-w-md border-l-2 border-[#f5b800]/70 bg-[#08090c]/90 px-4 py-2.5 text-sm leading-relaxed text-[#d4d1c9]">
                Avanza sin detenerte por los pasillos abandonados. Recoge baterías brillantes y
                sobrevive a las tres anomalías que acechan en la oscuridad.
              </p>

              <div className="flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={handleStart}
                  className="group relative cursor-pointer overflow-hidden border-2 border-[#f5b800] bg-[#f5b800] px-8 py-3.5 text-base font-black tracking-[0.2em] text-[#08090c] uppercase transition-transform active:scale-95 hover:bg-[#ffd038]"
                >
                  <span className="relative z-10 flex items-center gap-3">
                    <Flame className="h-5 w-5 fill-current" />
                    <span>
                      Comenzar · {activeMapMeta.name} ({activeDiffCfg.label})
                    </span>
                  </span>
                </button>

                <div className="border border-white/15 bg-[#0a0b0f]/92 px-4 py-2.5 text-xs text-[#b8b5ad]">
                  <div className="font-bold tracking-wider text-[#10f5c8] uppercase">
                    Amenazas activas · {activeMapMeta.name}
                  </div>
                  <div className="mt-0.5">{activeMapMeta.threatsLabel}</div>
                </div>
              </div>

              {/* Sensitivity Accessibility Slider */}
              <div className="mt-4 max-w-md border border-white/15 bg-[#0a0b0f]/92 px-4 py-2.5">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <label
                    htmlFor="sensitivity-slider"
                    className="text-xs font-bold tracking-[0.16em] text-[#e5e2da] uppercase"
                  >
                    Sensibilidad de linterna y cámara
                  </label>
                  <span className="tabular-nums text-xs font-black text-[#f5b800]">
                    {Math.round(settings.sensitivity * 100)}%
                  </span>
                </div>
                <input
                  id="sensitivity-slider"
                  type="range"
                  min={0.4}
                  max={2.0}
                  step={0.1}
                  value={settings.sensitivity}
                  onChange={(e) => updateSettings({ sensitivity: parseFloat(e.target.value) })}
                  className="h-2 w-full cursor-pointer accent-[#f5b800]"
                />
                <div className="mt-0.5 flex justify-between text-[10px] font-semibold tracking-wider text-[#8f8c84] uppercase">
                  <span>Baja</span>
                  <span>Normal</span>
                  <span>Alta</span>
                </div>
              </div>
            </div>

            {/* Map Selection Panel (Mapas) */}
            <div className="w-full max-w-md border border-white/15 bg-[#090a0f]/94 p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2 text-xs font-black tracking-[0.22em] text-[#f5b800] uppercase">
                  <MapPin className="h-4 w-4" />
                  <span>Mapas</span>
                </div>
                <span className="text-[11px] font-bold tracking-wider text-[#9b9890] uppercase">
                  {escuelaUnlocked ? '2 / 2 desbloqueados' : '1 / 2 desbloqueados'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                {GAME_MAPS.map((map) => {
                  const isLocked = map.id === 'escuela' && !escuelaUnlocked;
                  const isSelected = selectedMap === map.id;
                  const mapDiff = mapDifficulties[map.id];
                  const mapDiffCfg = getDifficultyConfig(mapDiff);

                  return (
                    <div
                      key={map.id}
                      className={`flex w-full flex-col gap-2 border p-3.5 transition-all ${
                        isLocked
                          ? 'border-white/10 bg-[#0d0e14]/85 opacity-75'
                          : isSelected
                            ? 'border-[#f5b800] bg-[#181409]/95 shadow-[0_0_0_1px_rgba(245,184,0,0.45)]'
                            : 'border-white/15 bg-[#0e1017]/92 hover:border-white/40'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => handleSelectMap(map.id)}
                        className={`flex w-full flex-col gap-1.5 text-left ${
                          isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {map.id === 'casa' ? (
                              <Home
                                className={`h-4 w-4 ${isSelected ? 'text-[#f5b800]' : 'text-[#d4d1c9]'}`}
                              />
                            ) : (
                              <School
                                className={`h-4 w-4 ${
                                  isLocked
                                    ? 'text-[#7c7972]'
                                    : isSelected
                                      ? 'text-[#f5b800]'
                                      : 'text-[#10f5c8]'
                                }`}
                              />
                            )}
                            <span className="text-sm font-black tracking-wider text-white uppercase">
                              {map.name}
                            </span>
                          </div>

                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 bg-[#e11d48]/20 px-2 py-0.5 text-[10px] font-black tracking-widest text-[#fb7185] uppercase">
                              <Lock className="h-3 w-3" />
                              <span>Bloqueado</span>
                            </span>
                          ) : isSelected ? (
                            <span className="inline-flex items-center gap-1 bg-[#f5b800] px-2 py-0.5 text-[10px] font-black tracking-widest text-[#08090c] uppercase">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Activo</span>
                            </span>
                          ) : (
                            <span className="bg-[#10f5c8]/15 px-2 py-0.5 text-[10px] font-black tracking-widest text-[#10f5c8] uppercase">
                              Desbloqueado
                            </span>
                          )}
                        </div>

                        <p className="text-xs leading-snug text-[#b4b1a8]">{map.description}</p>
                      </button>

                      {/* Per-Map Difficulty Selector (Fácil · Normal · Difícil) */}
                      {!isLocked ? (
                        <div className="border-t border-white/10 pt-2">
                          <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold tracking-widest uppercase">
                            <span className="text-[#9b9890]">Dificultad</span>
                            <span className="text-[#f5b800]">{mapDiffCfg.summary}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {DIFFICULTY_OPTIONS.map((opt) => {
                              const activeOpt = mapDiff === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => handleSelectDifficulty(map.id, opt.id)}
                                  className={`cursor-pointer border px-2 py-1 text-[11px] font-black tracking-wider uppercase transition-colors ${
                                    activeOpt
                                      ? opt.id === 'facil'
                                        ? 'border-[#10f5c8] bg-[#10f5c8]/20 text-[#10f5c8]'
                                        : opt.id === 'dificil'
                                          ? 'border-[#e11d48] bg-[#e11d48]/25 text-[#fb7185]'
                                          : 'border-[#f5b800] bg-[#f5b800]/20 text-[#f5b800]'
                                      : 'border-white/15 bg-[#0a0b10] text-[#9b9890] hover:border-white/35 hover:text-white'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-0.5 flex items-center gap-1.5 border-t border-white/10 pt-1.5 text-[11px] font-bold text-[#fb7185]">
                          <Lock className="h-3 w-3 shrink-0" />
                          <span>{map.unlockHint}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Hazard Strip & Control Hint */}
          <div className="relative z-10 flex flex-col gap-2">
            <div className="hazard-stripes h-2 w-full opacity-85" />
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#08090d]/92 px-3 py-2 text-[11px] font-semibold tracking-wider text-[#a8a59e] uppercase">
              <span>
                Ratón, táctil o Quest para apuntar · A / D o flechas para esquivar · Pulso (Espacio)
              </span>
              <span className="text-[#f5b800]">Audio procedural activado</span>
            </div>
          </div>
        </div>
      )}

      {/* ==================== LA CASA & LA ESCUELA INTRO CUTSCENES ==================== */}
      {hud.phase === 'cutscene' && (
        <div className="pointer-events-none absolute inset-0 z-25 flex flex-col justify-between">
          <div
            className="absolute inset-0 bg-[#020305]"
            style={{ opacity: hud.introFadeOpacity }}
          />
          <div className="relative z-10 flex items-center justify-between bg-black/88 px-5 py-3 sm:px-8">
            <span className="text-xs font-black tracking-[0.24em] text-[#f5b800] uppercase">
              {hud.mapId === 'escuela' ? 'La Escuela · Salón 1A' : 'La Casa · 03:14 AM'} ·{' '}
              {hudDiffCfg.label}
            </span>
            <button
              type="button"
              onClick={handleSkipCutscene}
              className="pointer-events-auto flex cursor-pointer items-center gap-1.5 border border-white/25 bg-[#101218] px-3 py-1.5 text-[11px] font-black tracking-widest text-[#f4f1ea] uppercase transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
            >
              <span>Saltar</span>
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-3 pb-4">
            {hud.subtitleText && (
              <div
                className={`mx-4 border-l-4 bg-[#06080d]/95 px-5 py-3 text-center shadow-2xl ${
                  hud.subtitleSpeaker === 'Maestro' ? 'border-[#f5b800]' : 'border-[#38bdf8]'
                }`}
              >
                {hud.subtitleSpeaker && (
                  <div
                    className={`mb-0.5 text-[10px] font-black tracking-[0.22em] uppercase ${
                      hud.subtitleSpeaker === 'Maestro' ? 'text-[#f5b800]' : 'text-[#38bdf8]'
                    }`}
                  >
                    {hud.subtitleSpeaker}
                  </div>
                )}
                <span className="text-base font-bold tracking-wide text-white sm:text-lg">
                  {hud.subtitleText}
                </span>
              </div>
            )}
            <div className="flex w-full items-center justify-between bg-black/88 px-6 py-2.5 sm:px-8">
              <span className="text-[11px] font-bold tracking-[0.2em] text-[#9b9890] uppercase">
                {hud.mapId === 'escuela' ? 'Salón de clases' : 'Habitación'}
              </span>
              <span className="text-[11px] font-bold tracking-[0.2em] text-[#38bdf8] uppercase">
                No apagues la linterna
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 3-SECOND CINEMATIC FADE-IN INTRO ==================== */}
      {hud.phase === 'intro' && (
        <div className="pointer-events-none absolute inset-0 z-25 flex flex-col justify-between">
          <div
            className="absolute inset-0 bg-[#020305]"
            style={{ opacity: hud.introFadeOpacity }}
          />
          <div className="relative z-10 h-10 w-full bg-black/85 sm:h-12" />
          <div className="relative z-10 flex items-end justify-between bg-black/85 px-6 py-3 sm:px-8">
            <span className="text-xs font-black tracking-[0.26em] text-[#f5b800] uppercase">
              {hudMapMeta.name} · {hudDiffCfg.label} · Entrada
            </span>
            <span className="text-[11px] font-bold tracking-[0.2em] text-[#9b9890] uppercase">
              No apagues la linterna
            </span>
          </div>
        </div>
      )}

      {/* ==================== GAMEPLAY HUD (LOW-OCCLUSION SPANISH OVERLAY) ==================== */}
      {hud.phase === 'playing' && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
          {/* Top Bar: Batería (Top-Left) & Salida/Audio (Top-Right) */}
          <div className="flex items-start justify-between gap-3">
            {/* Sleek Spanish Battery Bar HUD */}
            <div className="w-56 border border-white/15 bg-[#0a0b10]/92 p-3 sm:w-64">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 28 16" className="h-4 w-6" aria-hidden="true">
                    <rect
                      x="1"
                      y="2"
                      width="22"
                      height="12"
                      rx="2"
                      fill="none"
                      stroke={batteryColor}
                      strokeWidth="2"
                    />
                    <rect x="24" y="5" width="3" height="6" rx="1" fill={batteryColor} />
                    <rect
                      x="3.5"
                      y="4.5"
                      width={Math.max(0, (hud.battery / 100) * 17)}
                      height="7"
                      rx="1"
                      fill={batteryColor}
                    />
                  </svg>
                  <span className="text-xs font-extrabold tracking-[0.18em] text-[#e5e2da] uppercase">
                    Batería
                  </span>
                </div>
                <span
                  className="tabular-nums text-sm font-black"
                  style={{ color: batteryColor }}
                >
                  {hud.battery}%
                </span>
              </div>

              {/* Segmented Charge Bar */}
              <div className="h-2.5 w-full overflow-hidden bg-[#181a22] p-0.5">
                <div
                  className="h-full transition-[width] duration-150"
                  style={{
                    width: `${hud.battery}%`,
                    backgroundColor: batteryColor,
                  }}
                />
              </div>

              {hud.battery <= 22 && (
                <div className="mt-1.5 text-[10px] font-bold tracking-wider text-[#ef4444] uppercase">
                  ¡Energía crítica! Busca una batería
                </div>
              )}
            </div>

            {/* Top-Right Map Label, Difficulty, Progress, Mute & Pause/Settings */}
            <div className="flex items-center gap-2">
              <div className="border border-white/15 bg-[#0a0b10]/92 px-3.5 py-2 text-right">
                <div className="text-[10px] font-bold tracking-[0.18em] text-[#9b9890] uppercase">
                  {hudMapMeta.name} · {hudDiffCfg.label} · Salida
                </div>
                <div className="tabular-nums text-sm font-black text-[#10f5c8]">
                  {hud.progress}%
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Activar sonido' : 'Silenciar'}
                className="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center border border-white/15 bg-[#0a0b10]/92 text-[#f4f1ea] transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
              >
                {muted ? <VolumeX className="h-5 w-5 text-[#e11d48]" /> : <Volume2 className="h-5 w-5" />}
              </button>

              <button
                type="button"
                onClick={handleOpenSettings}
                aria-label="Pausa y ajustes"
                title="Pausa y ajustes"
                className="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center border border-[#f5b800]/45 bg-[#0a0b10]/92 text-[#f5b800] transition-colors hover:border-[#f5b800] hover:bg-[#191509]"
              >
                <Pause className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Subtle First-Encounter Hint Banner (Upper Center, non-blocking) */}
          {hud.hintText && (
            <div className="mx-auto mt-2 max-w-md border-l-4 border-[#f5b800] bg-[#0a0b10]/94 px-4 py-2.5 shadow-lg">
              <div className="text-[11px] font-black tracking-[0.2em] text-[#f5b800] uppercase">
                {hud.hintTitle}
              </div>
              <div className="mt-0.5 text-xs font-medium leading-snug text-[#ece9e1]">
                {hud.hintText}
              </div>
            </div>
          )}

          {/* Center Subtle Aiming Reticle & Anomaly Progress Ring */}
          <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative flex flex-col items-center">
              <svg viewBox="0 0 64 64" className="h-14 w-14 opacity-80">
                <circle
                  cx="32"
                  cy="32"
                  r="22"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="2"
                />
                {(hud.activeTarget.kind === 'sombra' ||
                  hud.activeTarget.kind === 'prefecta' ||
                  hud.activeTarget.kind === 'alumna') && (
                  <circle
                    cx="32"
                    cy="32"
                    r="22"
                    fill="none"
                    stroke={
                      hud.activeTarget.kind === 'prefecta'
                        ? '#fb7185'
                        : hud.activeTarget.kind === 'alumna'
                          ? '#22d3ee'
                          : '#c084fc'
                    }
                    strokeWidth="4"
                    strokeDasharray={2 * Math.PI * 22}
                    strokeDashoffset={2 * Math.PI * 22 * (1 - hud.activeTarget.charge)}
                    transform="rotate(-90 32 32)"
                  />
                )}
                <circle
                  cx="32"
                  cy="32"
                  r="2.5"
                  fill={
                    hud.activeTarget.kind === 'prefecta'
                      ? '#fb7185'
                      : hud.activeTarget.kind
                        ? '#f5b800'
                        : '#ffffff'
                  }
                />
              </svg>
              {hud.activeTarget.kind && (
                <div className="mt-1 flex flex-col items-center gap-0.5">
                  <div
                    className={`bg-[#090a0e]/92 px-2.5 py-0.5 text-[10px] font-black tracking-[0.16em] uppercase ${
                      hud.activeTarget.kind === 'prefecta'
                        ? 'text-[#fb7185]'
                        : hud.activeTarget.kind === 'alumna'
                          ? 'text-[#67e8f9]'
                          : 'text-[#f5b800]'
                    }`}
                  >
                    {hud.activeTarget.label}
                  </div>
                  {hud.activeTarget.subLabel && (
                    <div className="bg-[#090a0e]/92 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white uppercase">
                      {hud.activeTarget.subLabel}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Compact Control Dock for Touchscreens & Meta Quest Browser */}
          <div className="mx-auto flex items-center gap-2.5 pb-1">
            <button
              type="button"
              aria-label="Mover a la izquierda"
              onPointerDown={() => handleSteer(-1)}
              onPointerUp={() => handleSteer(0)}
              onPointerLeave={() => handleSteer(0)}
              onPointerCancel={() => handleSteer(0)}
              className="pointer-events-auto flex h-12 w-14 cursor-pointer items-center justify-center border border-white/20 bg-[#0b0c12]/92 text-[#f4f1ea] active:border-[#f5b800] active:bg-[#1a1d26]"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={handlePulse}
              disabled={!pulseReady}
              className={`pointer-events-auto relative flex h-12 min-w-[152px] cursor-pointer items-center justify-center gap-2 overflow-hidden border px-5 text-xs font-black tracking-[0.18em] uppercase transition-colors ${
                pulseReady
                  ? 'border-[#f5b800] bg-[#f5b800] text-[#08090c] hover:bg-[#ffd038] active:scale-95'
                  : 'border-white/15 bg-[#12141c]/90 text-white/45'
              }`}
            >
              {!pulseReady && (
                <span
                  className="absolute inset-y-0 left-0 bg-white/10"
                  style={{ width: `${Math.round((1 - hud.pulseCooldown) * 100)}%` }}
                />
              )}
              <Zap className="relative z-10 h-4 w-4 fill-current" />
              <span className="relative z-10">Pulso de luz</span>
            </button>

            <button
              type="button"
              aria-label="Mover a la derecha"
              onPointerDown={() => handleSteer(1)}
              onPointerUp={() => handleSteer(0)}
              onPointerLeave={() => handleSteer(0)}
              onPointerCancel={() => handleSteer(0)}
              className="pointer-events-auto flex h-12 w-14 cursor-pointer items-center justify-center border border-white/20 bg-[#0b0c12]/92 text-[#f4f1ea] active:border-[#f5b800] active:bg-[#1a1d26]"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== VICTORY SCREEN ==================== */}
      {hud.phase === 'victory' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#040608]/90 p-5">
          <div className="w-full max-w-md overflow-hidden border-2 border-[#10f5c8] bg-[#0a0d12] shadow-2xl">
            <div className="hazard-stripes h-2 w-full opacity-85" />
            <div className="p-6 sm:p-7">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-block bg-[#10f5c8]/15 px-3 py-1 text-[11px] font-black tracking-[0.22em] text-[#10f5c8] uppercase">
                  {hudMapMeta.name} · {hudDiffCfg.label} · Salida Alcanzada
                </span>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-label={muted ? 'Activar sonido' : 'Silenciar'}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center border border-white/15 text-white hover:border-[#10f5c8]"
                >
                  {muted ? <VolumeX className="h-4 w-4 text-[#e11d48]" /> : <Volume2 className="h-4 w-4 text-[#10f5c8]" />}
                </button>
              </div>

              <h2 className="text-3xl font-black tracking-wide text-white uppercase">
                ¡Escapaste con vida!
              </h2>
              <p className="mt-2 text-sm text-[#c4c1b8]">
                {hud.mapId === 'escuela'
                  ? 'Lograste atravesar los oscuros pasillos y aulas de La Escuela antes de que tu linterna se apagara.'
                  : 'Lograste cruzar los pasillos de La Casa antes de que la oscuridad consumiera tu linterna.'}
              </p>

              {lastRunResult && (
                <div className="mt-4 flex items-center justify-between border border-[#10f5c8]/30 bg-[#0f171b] px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Award className="h-4 w-4 text-[#f5b800]" />
                    <span className="font-bold text-[#d4d1c9]">
                      {playerName || 'Jugador'} ·{' '}
                      <strong className="text-white">
                        {lastRunResult.score.toLocaleString('es-ES')} pts
                      </strong>
                    </span>
                  </div>
                  <span
                    className={`border px-2.5 py-0.5 text-xs font-black tracking-widest uppercase ${getRankBadgeClass(
                      lastRunResult.rank,
                    )}`}
                  >
                    Rango {lastRunResult.rank}
                  </span>
                </div>
              )}

              {justUnlockedEscuela && (
                <div className="mt-3 flex items-center gap-2.5 border-l-4 border-[#f5b800] bg-[#1a1507] px-3.5 py-2.5 text-xs font-bold text-[#ffe58f]">
                  <Sparkles className="h-4 w-4 shrink-0 text-[#f5b800]" />
                  <span>¡Nuevo mapa desbloqueado: La Escuela! Selecciónalo en el menú principal.</span>
                </div>
              )}

              <div className="my-5 grid grid-cols-3 gap-2.5 border-y border-white/10 py-4 text-center">
                <div>
                  <div className="text-[10px] font-bold tracking-widest text-[#8f8c84] uppercase">
                    Tiempo
                  </div>
                  <div className="tabular-nums mt-1 text-xl font-black text-white">
                    {formatTimeEs(hud.elapsedSeconds)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold tracking-widest text-[#8f8c84] uppercase">
                    Baterías
                  </div>
                  <div className="tabular-nums mt-1 text-xl font-black text-[#10f5c8]">
                    {hud.batteriesCollected}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold tracking-widest text-[#8f8c84] uppercase">
                    Anomalías
                  </div>
                  <div className="tabular-nums mt-1 text-xl font-black text-[#f5b800]">
                    {hud.anomaliesDefeated}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleStart}
                    className="flex cursor-pointer items-center justify-center gap-2 bg-[#10f5c8] px-5 py-3.5 text-sm font-black tracking-[0.16em] text-[#06110e] uppercase transition-colors hover:bg-[#49ffd9]"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Reintentar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleReturnToMenu}
                    className="flex cursor-pointer items-center justify-center gap-2 border border-white/25 bg-[#12171e] px-5 py-3.5 text-sm font-black tracking-[0.14em] text-[#f4f1ea] uppercase transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
                  >
                    <Home className="h-4 w-4" />
                    <span>Menú principal</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenLeaderboard(hud.mapId)}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 border border-[#f5b800]/45 bg-[#14120a] px-4 py-2.5 text-xs font-extrabold tracking-[0.18em] text-[#f5b800] uppercase transition-colors hover:border-[#f5b800] hover:bg-[#1e190b]"
                >
                  <Trophy className="h-4 w-4" />
                  <span>Tabla de clasificación</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== DEFEAT SCREEN ==================== */}
      {hud.phase === 'defeat' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#080305]/92 p-5">
          <div className="w-full max-w-md overflow-hidden border-2 border-[#e11d48] bg-[#0c0709] shadow-2xl">
            <div className="hazard-stripes h-2 w-full opacity-90" />
            <div className="p-6 sm:p-7">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 bg-[#e11d48]/20 px-3 py-1 text-[11px] font-black tracking-[0.22em] text-[#fb7185] uppercase">
                  <Skull className="h-3.5 w-3.5" />
                  <span>{hudMapMeta.name} · {hudDiffCfg.label} · Señal Perdida</span>
                </span>
                <span className="tabular-nums text-[11px] font-bold tracking-widest text-[#9f898c] uppercase">
                  {formatTimeEs(hud.elapsedSeconds)}
                </span>
              </div>

              <h2 className="text-2xl font-black tracking-wide text-white uppercase sm:text-3xl">
                Consumido por la oscuridad
              </h2>

              <div className="mt-4 border-l-4 border-[#e11d48] bg-[#160a0f] px-4 py-3">
                <div className="text-[10px] font-bold tracking-[0.2em] text-[#fb7185] uppercase">
                  {hud.defeatedBy ? 'Atrapado por la anomalía' : 'Causa de la derrota'}
                </div>
                <div className="mt-0.5 text-lg font-black tracking-wide text-[#f5b800] uppercase">
                  {hud.defeatedBy ? ANOMALY_NAMES[hud.defeatedBy] : 'Sin batería en la oscuridad'}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[#e2c6ca]">
                  {hud.defeatReason || 'Las sombras reclamaron tu luz.'}
                </p>
              </div>

              {lastRunResult && (
                <div className="mt-3 flex items-center justify-between border border-white/10 bg-[#140c10] px-4 py-2">
                  <span className="text-xs font-bold text-[#d4c2c5]">
                    {playerName || 'Jugador'} ·{' '}
                    <strong className="text-white">
                      {lastRunResult.score.toLocaleString('es-ES')} pts
                    </strong>
                  </span>
                  <span
                    className={`border px-2 py-0.5 text-[11px] font-black tracking-widest uppercase ${getRankBadgeClass(
                      lastRunResult.rank,
                    )}`}
                  >
                    Rango {lastRunResult.rank}
                  </span>
                </div>
              )}

              <div className="my-4 grid grid-cols-3 gap-2.5 border-y border-white/10 py-3.5 text-center">
                <div>
                  <div className="text-[10px] font-bold tracking-widest text-[#9f898c] uppercase">
                    Avance
                  </div>
                  <div className="tabular-nums mt-1 text-xl font-black text-white">
                    {hud.progress}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold tracking-widest text-[#9f898c] uppercase">
                    Baterías
                  </div>
                  <div className="tabular-nums mt-1 text-xl font-black text-[#10f5c8]">
                    {hud.batteriesCollected}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold tracking-widest text-[#9f898c] uppercase">
                    Anomalías
                  </div>
                  <div className="tabular-nums mt-1 text-xl font-black text-[#f5b800]">
                    {hud.anomaliesDefeated}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleStart}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 bg-[#e11d48] px-6 py-3.5 text-sm font-black tracking-[0.18em] text-white uppercase transition-colors hover:bg-[#f43f5e] active:scale-[0.99]"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Reintentar</span>
                </button>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleReturnToMenu}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-2 border border-white/20 bg-[#141116] px-4 py-3 text-xs font-extrabold tracking-[0.16em] text-[#ece9e1] uppercase transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
                  >
                    <Home className="h-4 w-4" />
                    <span>Volver al menú principal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenLeaderboard(hud.mapId)}
                    aria-label="Tabla de clasificación"
                    className="flex cursor-pointer items-center justify-center gap-1.5 border border-[#f5b800]/45 bg-[#141116] px-3.5 py-3 text-xs font-extrabold tracking-wider text-[#f5b800] uppercase transition-colors hover:border-[#f5b800]"
                  >
                    <Trophy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    aria-label={muted ? 'Activar sonido' : 'Silenciar'}
                    className="flex cursor-pointer items-center justify-center border border-white/20 bg-[#141116] px-4 py-3 text-white transition-colors hover:border-[#f5b800]"
                  >
                    {muted ? <VolumeX className="h-5 w-5 text-[#e11d48]" /> : <Volume2 className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SPANISH LEADERBOARD MODAL (TABLA DE CLASIFICACIÓN) ==================== */}
      {showLeaderboard && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#030407]/92 p-4 sm:p-6">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden border-2 border-[#f5b800] bg-[#090a0f] shadow-2xl">
            <div className="hazard-stripes h-2 w-full shrink-0 opacity-90" />

            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Trophy className="h-5 w-5 text-[#f5b800]" />
                <div>
                  <h2 className="text-lg font-black tracking-wider text-white uppercase sm:text-xl">
                    Tabla de clasificación
                  </h2>
                  <p className="text-[11px] font-semibold tracking-wider text-[#9b9890] uppercase">
                    Ordenada por puntuación · Multiplicador por dificultad
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowLeaderboard(false)}
                aria-label="Cerrar tabla de clasificación"
                className="flex h-9 w-9 cursor-pointer items-center justify-center border border-white/20 bg-[#12141c] text-[#ece9e1] transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0d0f16] px-5 py-2.5">
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: 'Todos' },
                    { id: 'casa', label: 'La Casa' },
                    { id: 'escuela', label: 'La Escuela' },
                  ] as const
                ).map((tab) => {
                  const active = leaderboardFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setLeaderboardFilter(tab.id)}
                      className={`cursor-pointer border px-3 py-1.5 text-xs font-black tracking-wider uppercase transition-colors ${
                        active
                          ? 'border-[#f5b800] bg-[#f5b800] text-[#08090c]'
                          : 'border-white/15 bg-[#090a0f] text-[#b8b5ad] hover:border-white/40 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {leaderboard.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearLeaderboard}
                  className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-[10px] font-extrabold tracking-wider uppercase transition-colors ${
                    confirmClearBoard
                      ? 'border-[#e11d48] bg-[#e11d48]/25 text-[#fb7185]'
                      : 'border-white/15 bg-[#090a0f] text-[#9b9890] hover:border-[#e11d48]/60 hover:text-[#fb7185]'
                  }`}
                >
                  <Trash2 className="h-3 w-3" />
                  <span>{confirmClearBoard ? 'Confirmar borrado' : 'Limpiar historial'}</span>
                </button>
              )}
            </div>

            {/* Ranked Entries List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {(() => {
                const filtered = leaderboard.filter((entry) =>
                  leaderboardFilter === 'all' ? true : entry.mapId === leaderboardFilter,
                );
                if (filtered.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center border border-dashed border-white/15 bg-[#0c0e14] px-6 py-12 text-center">
                      <Trophy className="mb-3 h-8 w-8 text-[#57544d]" />
                      <div className="text-sm font-black tracking-wider text-[#d4d1c9] uppercase">
                        Aún no hay partidas registradas
                      </div>
                      <p className="mt-1 max-w-sm text-xs text-[#8f8c84]">
                        Completa o intenta sobrevivir en La Casa o La Escuela para registrar tu
                        puntuación y rango en la clasificación.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col gap-2">
                    {filtered.map((entry, idx) => {
                      const isLatest = lastRunResult?.entryId === entry.id;
                      const isCurrentPlayer = entry.playerName === playerName;
                      const mapName = entry.mapId === 'escuela' ? 'La Escuela' : 'La Casa';
                      const diffLabel = getDifficultyConfig(entry.difficulty).label;

                      return (
                        <div
                          key={entry.id}
                          className={`flex flex-wrap items-center justify-between gap-3 border px-3.5 py-2.5 ${
                            isLatest
                              ? 'border-[#f5b800] bg-[#1a1508]'
                              : isCurrentPlayer
                                ? 'border-[#10f5c8]/35 bg-[#0d1417]'
                                : 'border-white/10 bg-[#0d0f15]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`tabular-nums w-7 text-center text-sm font-black ${
                                idx === 0
                                  ? 'text-[#f5b800]'
                                  : idx === 1
                                    ? 'text-[#e5e2da]'
                                    : idx === 2
                                      ? 'text-[#d97706]'
                                      : 'text-[#7c7972]'
                              }`}
                            >
                              #{idx + 1}
                            </span>

                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center border text-sm font-black ${getRankBadgeClass(
                                entry.rank,
                              )}`}
                            >
                              {entry.rank}
                            </span>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-white">
                                  {entry.playerName}
                                </span>
                                {isLatest && (
                                  <span className="bg-[#f5b800] px-1.5 py-0.5 text-[9px] font-black tracking-widest text-[#08090c] uppercase">
                                    Reciente
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#9b9890]">
                                <span className="text-[#d4d1c9]">{mapName}</span>
                                <span>·</span>
                                <span
                                  className={
                                    entry.difficulty === 'dificil'
                                      ? 'text-[#fb7185]'
                                      : entry.difficulty === 'facil'
                                        ? 'text-[#10f5c8]'
                                        : 'text-[#f5b800]'
                                  }
                                >
                                  {diffLabel}
                                </span>
                                <span>·</span>
                                <span
                                  className={
                                    entry.completed ? 'text-[#10f5c8]' : 'text-[#b8b5ad]'
                                  }
                                >
                                  {entry.completed
                                    ? `¡Escapó! (${formatTimeEs(entry.elapsedSeconds)})`
                                    : `Avance ${entry.progress}% (${formatTimeEs(entry.elapsedSeconds)})`}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="tabular-nums text-base font-black text-[#f5b800]">
                              {entry.score.toLocaleString('es-ES')} pts
                            </div>
                            <div className="tabular-nums text-[10px] font-bold tracking-wider text-[#8f8c84] uppercase">
                              {entry.anomaliesDefeated} anom. · {entry.batteriesCollected} bat.
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 bg-[#0b0c12] px-5 py-3">
              <span className="text-[11px] font-semibold text-[#8f8c84]">
                Jugador activo: <strong className="text-white">{playerName || 'Sin registro'}</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowLeaderboard(false)}
                className="cursor-pointer border border-white/25 bg-[#141720] px-4 py-1.5 text-xs font-black tracking-widest text-white uppercase transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SPANISH AJUSTES / PAUSE SETTINGS PANEL ==================== */}
      {showSettings && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#030407]/92 p-4 sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden border-2 border-[#f5b800] bg-[#090a0f] shadow-2xl">
            <div className="hazard-stripes h-2 w-full shrink-0 opacity-90" />

            {/* Modal Header */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Settings className="h-5 w-5 text-[#10f5c8]" />
                <div>
                  <h2 className="text-lg font-black tracking-wider text-white uppercase sm:text-xl">
                    {hud.paused ? 'Pausa · Ajustes' : 'Ajustes'}
                  </h2>
                  <p className="text-[11px] font-semibold tracking-wider text-[#9b9890] uppercase">
                    {hud.paused
                      ? `${hudMapMeta.name} · ${hudDiffCfg.label}`
                      : 'Gráficos, sensibilidad y audio procedural'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseSettings}
                aria-label="Cerrar ajustes"
                className="flex h-9 w-9 cursor-pointer items-center justify-center border border-white/20 bg-[#12141c] text-[#ece9e1] transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Settings Body */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* 1. Calidad Gráfica */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-black tracking-[0.18em] text-[#f5b800] uppercase">
                    <Monitor className="h-4 w-4" />
                    <span>Calidad gráfica</span>
                  </span>
                  <span className="text-[11px] font-black tracking-wider text-[#10f5c8] uppercase">
                    {GRAPHICS_QUALITY_OPTIONS.find((q) => q.id === settings.graphicsQuality)?.label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {GRAPHICS_QUALITY_OPTIONS.map((opt) => {
                    const active = settings.graphicsQuality === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          engineRef.current?.audio.unlock();
                          engineRef.current?.audio.playFlashlightClick();
                          updateSettings({ graphicsQuality: opt.id });
                        }}
                        className={`cursor-pointer border px-3 py-2.5 text-xs font-black tracking-widest uppercase transition-colors ${
                          active
                            ? 'border-[#10f5c8] bg-[#10f5c8]/20 text-[#10f5c8]'
                            : 'border-white/15 bg-[#0e1017] text-[#a8a59e] hover:border-white/40 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 border-l-2 border-[#10f5c8]/50 bg-[#0d1016] px-3 py-1.5 text-[11px] leading-snug text-[#b8b5ad]">
                  {
                    GRAPHICS_QUALITY_OPTIONS.find((q) => q.id === settings.graphicsQuality)
                      ?.description
                  }
                </p>
              </div>

              {/* 2. Sensibilidad de Linterna */}
              <div className="border-t border-white/10 pt-4">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label
                    htmlFor="modal-sensitivity-slider"
                    className="text-xs font-black tracking-[0.16em] text-[#e5e2da] uppercase"
                  >
                    Sensibilidad de linterna
                  </label>
                  <span className="tabular-nums text-xs font-black text-[#f5b800]">
                    {Math.round(settings.sensitivity * 100)}%
                  </span>
                </div>
                <input
                  id="modal-sensitivity-slider"
                  type="range"
                  min={0.4}
                  max={2.0}
                  step={0.1}
                  value={settings.sensitivity}
                  onChange={(e) => updateSettings({ sensitivity: parseFloat(e.target.value) })}
                  className="h-2 w-full cursor-pointer accent-[#f5b800]"
                />
                <div className="mt-1 flex justify-between text-[10px] font-semibold tracking-wider text-[#8f8c84] uppercase">
                  <span>Baja (40%)</span>
                  <span>Normal (100%)</span>
                  <span>Alta (200%)</span>
                </div>
              </div>

              {/* 3. Volumen de Música */}
              <div className="border-t border-white/10 pt-4">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label
                    htmlFor="music-volume-slider"
                    className="flex items-center gap-2 text-xs font-black tracking-[0.16em] text-[#e5e2da] uppercase"
                  >
                    <Music className="h-3.5 w-3.5 text-[#38bdf8]" />
                    <span>Volumen de música</span>
                  </label>
                  <span className="tabular-nums text-xs font-black text-[#38bdf8]">
                    {Math.round(settings.musicVolume * 100)}%
                  </span>
                </div>
                <input
                  id="music-volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.musicVolume}
                  onChange={(e) => updateSettings({ musicVolume: parseFloat(e.target.value) })}
                  className="h-2 w-full cursor-pointer accent-[#38bdf8]"
                />
              </div>

              {/* 4. Volumen de Efectos */}
              <div className="border-t border-white/10 pt-4">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label
                    htmlFor="sfx-volume-slider"
                    className="flex items-center gap-2 text-xs font-black tracking-[0.16em] text-[#e5e2da] uppercase"
                  >
                    <Volume2 className="h-3.5 w-3.5 text-[#10f5c8]" />
                    <span>Volumen de efectos</span>
                  </label>
                  <span className="tabular-nums text-xs font-black text-[#10f5c8]">
                    {Math.round(settings.sfxVolume * 100)}%
                  </span>
                </div>
                <input
                  id="sfx-volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sfxVolume}
                  onChange={(e) => updateSettings({ sfxVolume: parseFloat(e.target.value) })}
                  className="h-2 w-full cursor-pointer accent-[#10f5c8]"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-white/10 bg-[#0b0c12] px-5 py-3.5">
              {hud.paused ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleCloseSettings}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 bg-[#10f5c8] px-5 py-3 text-sm font-black tracking-[0.18em] text-[#06110e] uppercase transition-colors hover:bg-[#49ffd9]"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Reanudar partida</span>
                  </button>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleStart}
                      className="flex cursor-pointer items-center justify-center gap-1.5 border border-white/20 bg-[#141720] px-3 py-2 text-[11px] font-black tracking-wider text-white uppercase transition-colors hover:border-[#f5b800] hover:text-[#f5b800]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Reiniciar</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetSettings}
                      className="cursor-pointer border border-white/20 bg-[#141720] px-3 py-2 text-[11px] font-black tracking-wider text-[#b8b5ad] uppercase transition-colors hover:border-white/50 hover:text-white"
                    >
                      Restablecer
                    </button>
                    <button
                      type="button"
                      onClick={handleReturnToMenu}
                      className="flex cursor-pointer items-center justify-center gap-1.5 border border-[#e11d48]/50 bg-[#1a0b10] px-3 py-2 text-[11px] font-black tracking-wider text-[#fb7185] uppercase transition-colors hover:border-[#e11d48]"
                    >
                      <Home className="h-3.5 w-3.5" />
                      <span>Menú</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleResetSettings}
                    className="cursor-pointer border border-white/15 bg-[#12141c] px-3.5 py-2 text-xs font-extrabold tracking-wider text-[#b8b5ad] uppercase transition-colors hover:border-white/40 hover:text-white"
                  >
                    Restablecer
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseSettings}
                    className="cursor-pointer border-2 border-[#f5b800] bg-[#f5b800] px-5 py-2 text-xs font-black tracking-[0.18em] text-[#08090c] uppercase transition-colors hover:bg-[#ffd038]"
                  >
                    Guardar y cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
