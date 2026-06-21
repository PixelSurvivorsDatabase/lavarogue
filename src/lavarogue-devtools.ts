/*
 * LavaRogue browser console dev tools.
 *
 * These commands are intentionally local/dev-only helpers for the LavaRogue fork.
 * They are exposed as `window.lava` to make testing custom mechanics faster.
 */

import { globalScene } from "#app/global-scene";
import { AbilityAttr } from "#enums/ability-attr";
import { DexAttr } from "#enums/dex-attr";
import { MoveId } from "#enums/move-id";
import { SpeciesId } from "#enums/species-id";
import { Stat } from "#enums/stat";
import { Pokemon } from "#field/pokemon";
import { LAVAROGUE_MOVE_IDS } from "./lavarogue-custom-moves";

type WaveJumpOptions = {
  save?: boolean;
};

type PartyRow = {
  index: number;
  name: string;
  speciesId: SpeciesId;
  level: number;
  hp: string;
  form: string;
  shiny: boolean;
  passive: boolean;
  ability: string;
  moves: string[];
};

type RayDebugInfo = PartyRow & {
  isMega: boolean;
  dragonEmperorActive: boolean;
  stats: Record<string, number>;
  effectiveSpeed: number;
};

type LavaRogueDevTools = {
  help: () => string[];
  scene: () => typeof globalScene;
  info: () => Record<string, unknown>;
  party: () => PartyRow[];
  debugRay: () => RayDebugInfo | string;
  healParty: () => string;
  reviveParty: () => string;
  maxParty: () => string;
  giveMoney: (amount?: number) => string;
  setMoney: (amount?: number) => string;
  setNextWave: (wave: number, options?: WaveJumpOptions) => string;
  jumpWave: (wave: number, options?: WaveJumpOptions) => string;
  skipToWave: (wave: number, options?: WaveJumpOptions) => string;
  testEternatus: (options?: WaveJumpOptions) => string;
  megaRay: () => Promise<string>;
  shinyMegaRay: () => Promise<string>;
  setRayLevel: (level: number) => Promise<string>;
  unlockRay: () => Promise<string>;
  save: () => Promise<string>;
  reload: () => string;
  ids: () => Record<string, unknown>;
};

declare global {
  interface Window {
    lava: LavaRogueDevTools;
  }
}

function assertScene() {
  if (!globalScene) {
    throw new Error("LavaRogue scene is not ready yet. Try again after the game loads.");
  }
  return globalScene as any;
}

function getMaxHp(pokemon: any): number {
  return pokemon.getMaxHp?.() ?? pokemon.getMaxHp ?? pokemon.stats?.[Stat.HP] ?? pokemon.hp ?? 1;
}

function getMoveNames(pokemon: any): string[] {
  return pokemon
    .getMoveset?.()
    ?.filter(Boolean)
    ?.map((move: any) => move?.getMove?.()?.name ?? MoveId[move?.moveId] ?? String(move?.moveId ?? "Unknown")) ?? [];
}

function toPartyRow(pokemon: any, index: number): PartyRow {
  return {
    index,
    name: pokemon.getNameToRender?.() ?? pokemon.name ?? pokemon.species?.name ?? "Unknown",
    speciesId: pokemon.species?.speciesId,
    level: pokemon.level,
    hp: `${pokemon.hp}/${getMaxHp(pokemon)}`,
    form: pokemon.getFormKey?.() ?? String(pokemon.formIndex ?? "default"),
    shiny: !!pokemon.shiny,
    passive: !!pokemon.passive,
    ability: pokemon.getAbility?.()?.name ?? "Unknown",
    moves: getMoveNames(pokemon),
  };
}

function getRay(): Pokemon | undefined {
  return assertScene()
    .getPlayerParty()
    .find((pokemon: Pokemon) => pokemon.species?.speciesId === SpeciesId.RAYQUAZA);
}

function setPokemonHpFull(pokemon: any): void {
  pokemon.hp = getMaxHp(pokemon);
  pokemon.status = undefined;
  pokemon.sleepTurns = 0;
  pokemon.updateInfo?.(true);
}

async function saveGame(): Promise<void> {
  const scene = assertScene();
  if (scene.gameData?.saveAll) {
    await scene.gameData.saveAll(true, false);
    return;
  }
  if (scene.gameData?.saveSystem) {
    await scene.gameData.saveSystem();
  }
}

function updateHud(): void {
  const scene = assertScene();
  scene.updateMoneyText?.();
  scene.updateScoreText?.();
  scene.updateGameInfo?.();
}

function setCurrentBattleForNextWave(wave: number): void {
  if (!Number.isInteger(wave) || wave < 1) {
    throw new Error("Wave must be a positive whole number.");
  }

  const scene = assertScene();
  if (!scene.currentBattle) {
    throw new Error("No active battle exists yet. Start a run first.");
  }

  scene.currentBattle.waveIndex = wave - 1;
}

async function setRayForm({ shiny }: { shiny?: boolean } = {}): Promise<string> {
  const ray = getRay() as any;
  if (!ray) {
    return "Rayquaza is not in your party right now.";
  }

  const megaIndex = ray.species.forms.findIndex((form: any) => String(form.formKey ?? "").toLowerCase().includes("mega"));
  if (megaIndex < 0) {
    return "Could not find Rayquaza's Mega form index.";
  }

  ray.formIndex = megaIndex;
  ray.passive = true;
  if (shiny !== undefined) {
    ray.shiny = shiny;
    ray.variant = 0;
    ray.luck = shiny ? 1 : 0;
  }

  ray.generateName?.();
  ray.calculateStats?.();
  setPokemonHpFull(ray);
  await ray.loadAssets?.(false);
  ray.updateInfo?.(true);
  await saveGame();

  return shiny ? "Shiny Mega Rayquaza is active and saved." : "Mega Rayquaza is active with Dragon Emperor and saved.";
}

function unlockStarterSpecies(speciesId: SpeciesId): void {
  const scene = assertScene();
  const caughtAttr = DexAttr.NON_SHINY | DexAttr.MALE | DexAttr.FEMALE | DexAttr.DEFAULT_VARIANT | DexAttr.DEFAULT_FORM;
  const dex = scene.gameData.dexData[speciesId];

  dex.seenAttr |= caughtAttr;
  dex.caughtAttr |= caughtAttr;
  dex.seenCount = Math.max(dex.seenCount ?? 0, 1);
  dex.caughtCount = Math.max(dex.caughtCount ?? 0, 1);
  dex.ivs = [31, 31, 31, 31, 31, 31];
  dex.natureAttr = (1 << 26) - 2;

  scene.gameData.starterData[speciesId] ??= {
    moveset: null,
    eggMoves: 0,
    candyCount: 0,
    friendship: 0,
    abilityAttr: 0,
    passiveAttr: 0,
    valueReduction: 0,
    classicWinCount: 0,
  };

  const starter = scene.gameData.starterData[speciesId];
  starter.abilityAttr = AbilityAttr.ABILITY_1 | AbilityAttr.ABILITY_2 | AbilityAttr.ABILITY_HIDDEN;
  starter.eggMoves = 15;
  starter.candyCount = Math.max(starter.candyCount ?? 0, 999);
  starter.friendship = Math.max(starter.friendship ?? 0, 255);
}

function installLavaDevTools(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.lava = {
    help: () => [
      "lava.info() - run/wave/money/seed summary",
      "lava.party() - table-friendly party summary",
      "lava.debugRay() - Rayquaza form/passive/stat/move details",
      "lava.healParty() - fully heal current party",
      "lava.reviveParty() - revive and fully heal current party",
      "lava.maxParty() - set party IVs to 31 and heal",
      "lava.giveMoney(amount = 999999) - add money",
      "lava.setMoney(amount = 999999) - set money",
      "lava.setNextWave(wave) - make the next battle become that wave after the current battle ends",
      "lava.jumpWave(wave) / lava.skipToWave(wave) - immediately queue a new battle for that wave",
      "lava.testEternatus() - jump to Classic wave 200",
      "lava.megaRay() - force current party Rayquaza into Mega form and enable passive",
      "lava.shinyMegaRay() - force shiny Mega Rayquaza and enable passive",
      "lava.setRayLevel(level) - set current party Rayquaza level",
      "lava.unlockRay() - unlock Rayquaza starter, egg moves, abilities, candy, and IVs",
      "lava.save() - save current game data",
      "lava.reload() - reload page",
      "lava.scene() - raw BattleScene object for deeper debugging",
      "lava.ids() - useful enum/custom move ids",
    ],

    scene: () => assertScene(),

    info: () => {
      const scene = assertScene();
      return {
        wave: scene.currentBattle?.waveIndex,
        battleType: scene.currentBattle?.battleType,
        turn: scene.currentBattle?.turn,
        double: scene.currentBattle?.double,
        money: scene.money,
        score: scene.score,
        seed: scene.seed,
        waveSeed: scene.waveSeed,
        gameMode: scene.gameMode?.modeId ?? scene.gameMode,
        modifiers: scene.modifiers?.map((modifier: any) => modifier.constructor?.name ?? String(modifier)),
        enemyParty: scene.getEnemyParty?.().map((pokemon: any, index: number) => toPartyRow(pokemon, index)),
      };
    },

    party: () => assertScene().getPlayerParty().map((pokemon: any, index: number) => toPartyRow(pokemon, index)),

    debugRay: () => {
      const ray = getRay() as any;
      if (!ray) {
        return "Rayquaza is not in your party right now.";
      }

      return {
        ...toPartyRow(ray, assertScene().getPlayerParty().indexOf(ray)),
        isMega: !!ray.isMega?.(),
        dragonEmperorActive: ray.species?.speciesId === SpeciesId.RAYQUAZA && !!ray.isMega?.() && !!ray.passive,
        stats: {
          hp: ray.stats?.[Stat.HP],
          atk: ray.stats?.[Stat.ATK],
          def: ray.stats?.[Stat.DEF],
          spatk: ray.stats?.[Stat.SPATK],
          spdef: ray.stats?.[Stat.SPDEF],
          spd: ray.stats?.[Stat.SPD],
        },
        effectiveSpeed: ray.getEffectiveStat?.(Stat.SPD),
      };
    },

    healParty: () => {
      assertScene().getPlayerParty().forEach(setPokemonHpFull);
      updateHud();
      return "Party healed.";
    },

    reviveParty: () => {
      assertScene().getPlayerParty().forEach(setPokemonHpFull);
      updateHud();
      return "Party revived and healed.";
    },

    maxParty: () => {
      assertScene().getPlayerParty().forEach((pokemon: any) => {
        pokemon.ivs = [31, 31, 31, 31, 31, 31];
        pokemon.calculateStats?.();
        setPokemonHpFull(pokemon);
      });
      updateHud();
      return "Party IVs maxed and healed.";
    },

    giveMoney: (amount = 999999) => {
      const scene = assertScene();
      scene.money += Math.max(Math.floor(amount), 0);
      updateHud();
      return `Added ${amount} money. Current money: ${scene.money}`;
    },

    setMoney: (amount = 999999) => {
      const scene = assertScene();
      scene.money = Math.max(Math.floor(amount), 0);
      updateHud();
      return `Money set to ${scene.money}.`;
    },

    setNextWave: (wave: number, options: WaveJumpOptions = {}) => {
      setCurrentBattleForNextWave(wave);
      if (options.save) {
        void saveGame();
      }
      return `Next battle will be wave ${wave}. Finish or exit the current battle to advance there.`;
    },

    jumpWave: (wave: number, options: WaveJumpOptions = {}) => {
      const scene = assertScene();
      setCurrentBattleForNextWave(wave);
      scene.phaseManager.unshiftNew?.("NewBattlePhase");
      if (options.save) {
        void saveGame();
      }
      return `Queued immediate jump to wave ${wave}.`;
    },

    skipToWave: (wave: number, options: WaveJumpOptions = {}) => window.lava.jumpWave(wave, options),

    testEternatus: (options: WaveJumpOptions = {}) => window.lava.jumpWave(200, options),

    megaRay: () => setRayForm(),

    shinyMegaRay: () => setRayForm({ shiny: true }),

    setRayLevel: async (level: number) => {
      const ray = getRay() as any;
      if (!ray) {
        return "Rayquaza is not in your party right now.";
      }
      if (!Number.isInteger(level) || level < 1) {
        return "Level must be a positive whole number.";
      }

      ray.level = level;
      ray.calculateStats?.();
      setPokemonHpFull(ray);
      await ray.loadAssets?.(false);
      ray.updateInfo?.(true);
      await saveGame();
      return `Rayquaza level set to ${level} and saved.`;
    },

    unlockRay: async () => {
      unlockStarterSpecies(SpeciesId.RAYQUAZA);
      await saveGame();
      return "Rayquaza unlocked with max IVs, all abilities, all egg moves, 999 candy, and high friendship.";
    },

    save: async () => {
      await saveGame();
      return "Saved.";
    },

    reload: () => {
      location.reload();
      return "Reloading.";
    },

    ids: () => ({
      SpeciesId: {
        RAYQUAZA: SpeciesId.RAYQUAZA,
        ETERNATUS: SpeciesId.ETERNATUS,
      },
      Stat,
      MoveId,
      LAVAROGUE_MOVE_IDS,
    }),
  };

  console.log("%cLavaRogue dev tools loaded. Type lava.help()", "color: #ff5c33; font-weight: bold;");
}

export function initLavaRogueDevTools(): void {
  installLavaDevTools();
}
