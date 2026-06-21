/*
 * LavaRogue custom balance patch: Celestial Ascent and Stellar Delta Stream buffs.
 */

import { globalScene } from "#app/global-scene";
import { getPokemonNameWithAffix } from "#app/messages";
import { allMoves } from "#data/data-lists";
import { AbilityId } from "#enums/ability-id";
import { PokemonType } from "#enums/pokemon-type";
import { SpeciesId } from "#enums/species-id";
import { Stat } from "#enums/stat";
import { WeatherType } from "#enums/weather-type";
import { Pokemon } from "#field/pokemon";
import { Move, MoveEffectAttr } from "#moves/move";
import { LAVAROGUE_MOVE_IDS } from "./lavarogue-custom-moves";

const CELESTIAL_ASCENT_POWER = 180;
const CELESTIAL_ASCENT_PRIORITY = 1;
const CELESTIAL_ASCENT_DEFENSE_STAGE_DROP = 2;
const CELESTIAL_ASCENT_SPEED_DROP_PER_HIT = 0.1;
const CELESTIAL_ASCENT_MIN_SPEED_MULTIPLIER = 0.1;
const DRAGON_EMPEROR_CELESTIAL_ASCENT_MULTIPLIER = 1.5;
const DELTA_STREAM_STELLAR_DAMAGE_MULTIPLIER = 1.55;

type CelestialAscentTargetData = {
  battleKey: string;
  speedDrops: number;
};

class CelestialAscentDebuffAttr extends MoveEffectAttr {
  constructor() {
    super(false, { firstHitOnly: true });
  }

  override apply(user: Pokemon, target: Pokemon, move: Move, args?: any[]): boolean {
    if (!super.apply(user, target, move, args)) {
      return false;
    }

    applyCelestialAscentDebuffs(user, target);
    return true;
  }
}

function isBuffedDeltaStreamActive(): boolean {
  const weather = globalScene?.arena?.weather;
  return weather?.weatherType === WeatherType.STRONG_WINDS && !weather.isEffectSuppressed();
}

function sideHasDeltaStream(pokemon: Pokemon): boolean {
  if (!isBuffedDeltaStreamActive()) {
    return false;
  }

  return globalScene
    .getField(true)
    .some(fieldPokemon => fieldPokemon.isPlayer() === pokemon.isPlayer() && fieldPokemon.hasAbility(AbilityId.DELTA_STREAM));
}

function hasDragonEmperor(pokemon?: Pokemon | null): pokemon is Pokemon {
  return !!pokemon && pokemon.species?.speciesId === SpeciesId.RAYQUAZA && pokemon.isMega() && !!pokemon.passive;
}

function isCelestialAscent(move: Move): boolean {
  return move.id === LAVAROGUE_MOVE_IDS.CELESTIAL_ASCENT;
}

function getCurrentBattleKey(): string {
  const battle = globalScene?.currentBattle as any;
  return `${battle?.battleType ?? "battle"}:${battle?.waveIndex ?? "unknown"}`;
}

function getCelestialAscentTargetData(target: Pokemon): CelestialAscentTargetData {
  const battleKey = getCurrentBattleKey();
  const anyTarget = target as any;

  if (!anyTarget.__lavarogueCelestialAscentData || anyTarget.__lavarogueCelestialAscentData.battleKey !== battleKey) {
    anyTarget.__lavarogueCelestialAscentData = {
      battleKey,
      speedDrops: 0,
    } satisfies CelestialAscentTargetData;
  }

  return anyTarget.__lavarogueCelestialAscentData;
}

function getCelestialAscentSpeedMultiplier(pokemon: Pokemon): number {
  const data = (pokemon as any).__lavarogueCelestialAscentData as CelestialAscentTargetData | undefined;
  if (!data || data.battleKey !== getCurrentBattleKey()) {
    return 1;
  }

  return Math.max(CELESTIAL_ASCENT_MIN_SPEED_MULTIPLIER, 1 - data.speedDrops * CELESTIAL_ASCENT_SPEED_DROP_PER_HIT);
}

function applyCelestialAscentDebuffs(user: Pokemon, target: Pokemon): void {
  if (target.isFainted()) {
    return;
  }

  target.setStatStage(Stat.DEF, target.getStatStage(Stat.DEF) - CELESTIAL_ASCENT_DEFENSE_STAGE_DROP);
  getCelestialAscentTargetData(target).speedDrops += 1;

  globalScene.phaseManager.queueMessage(
    `${getPokemonNameWithAffix(target)}'s Defense harshly fell from ${getPokemonNameWithAffix(user)}'s Celestial Ascent!`,
  );
  globalScene.phaseManager.queueMessage(`${getPokemonNameWithAffix(target)}'s Speed was cut by 10%!`);
  target.updateInfo?.(true);
}

function setCelestialAscentStatsAndEffects(): void {
  const celestialAscentId = LAVAROGUE_MOVE_IDS.CELESTIAL_ASCENT;
  const celestialAscent = (allMoves as unknown as Move[])[celestialAscentId];

  if (celestialAscent) {
    celestialAscent.power = CELESTIAL_ASCENT_POWER;
    celestialAscent.priority = CELESTIAL_ASCENT_PRIORITY;

    if (!celestialAscent.getAttrs("MoveEffectAttr").some(attr => attr instanceof CelestialAscentDebuffAttr)) {
      celestialAscent.addAttr(new CelestialAscentDebuffAttr());
    }
  }
}

export function initLavaRogueCelestialAscentBuffs(): void {
  const installKey = "__lavarogueCelestialAscentBuffsInstalled";
  if ((globalThis as any)[installKey]) {
    setCelestialAscentStatsAndEffects();
    return;
  }
  (globalThis as any)[installKey] = true;

  setCelestialAscentStatsAndEffects();

  const originalCalculateBattlePower = Move.prototype.calculateBattlePower;
  Move.prototype.calculateBattlePower = function calculateLavaRogueCelestialAscentBattlePower(
    source: Pokemon,
    target: Pokemon,
    simulated = false,
  ): number {
    let power = originalCalculateBattlePower.call(this, source, target, simulated);

    if (power <= 0) {
      return power;
    }

    if (isCelestialAscent(this) && hasDragonEmperor(source)) {
      power = Math.max(Math.floor(power * DRAGON_EMPEROR_CELESTIAL_ASCENT_MULTIPLIER), 1);
    }

    if (sideHasDeltaStream(source) && source.getMoveType(this) === PokemonType.STELLAR) {
      power = Math.max(Math.floor(power * DELTA_STREAM_STELLAR_DAMAGE_MULTIPLIER), 1);
    }

    return power;
  };

  const originalGetEffectiveStat = Pokemon.prototype.getEffectiveStat;
  Pokemon.prototype.getEffectiveStat = function getLavaRogueCelestialAscentEffectiveStat(
    stat: any,
    opponent?: any,
    move?: any,
    ignoreAbility?: any,
    ignoreOppAbility?: any,
    ignoreAllyAbility?: any,
    isCritical?: any,
    simulated?: any,
    ignoreHeldItems?: any,
  ) {
    let statValue = originalGetEffectiveStat.call(
      this,
      stat,
      opponent,
      move,
      ignoreAbility,
      ignoreOppAbility,
      ignoreAllyAbility,
      isCritical,
      simulated,
      ignoreHeldItems,
    );

    if (stat === Stat.SPD) {
      statValue *= getCelestialAscentSpeedMultiplier(this);
    }

    return Math.max(Math.floor(statValue), 1);
  };
}
