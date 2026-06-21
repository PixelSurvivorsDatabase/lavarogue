/*
 * LavaRogue custom balance patch: Buffed Delta Stream.
 *
 * Keeps the changes isolated from upstream PokéRogue files so the fork is easier to maintain.
 */

import { globalScene } from "#app/global-scene";
import { getTypeDamageMultiplier } from "#data/type";
import { AbilityId } from "#enums/ability-id";
import { MoveCategory } from "#enums/move-category";
import { PokemonType } from "#enums/pokemon-type";
import { Stat } from "#enums/stat";
import { WeatherType } from "#enums/weather-type";
import { Arena } from "#field/arena";
import { Pokemon } from "#field/pokemon";
import { Move } from "#moves/move";
import { TurnStartPhase } from "#phases/turn-start-phase";

const DELTA_STREAM_SUPPRESSED_TYPES = new Set<PokemonType>([
  PokemonType.ROCK,
  PokemonType.ELECTRIC,
  PokemonType.ICE,
]);

const DELTA_STREAM_BOOSTED_TYPES = new Set<PokemonType>([
  PokemonType.FLYING,
  PokemonType.DRAGON,
]);

const DELTA_STREAM_DAMAGE_MULTIPLIER = 1.35;
const DELTA_STREAM_BASE_SPEED_BONUS = 0.5;
const DELTA_STREAM_SPEED_BONUS_PER_ROUND = 0.1;
const DELTA_STREAM_MAX_SPEED_BONUS = 2;
const DELTA_STREAM_EVASION_STAGE_BONUS = 1;

type DeltaStreamSideData = {
  battleKey: string;
  playerRounds: number;
  enemyRounds: number;
};

function isBuffedDeltaStreamActive(): boolean {
  const weather = globalScene?.arena?.weather;
  return weather?.weatherType === WeatherType.STRONG_WINDS && !weather.isEffectSuppressed();
}

function getCurrentBattleKey(): string {
  const battle = globalScene?.currentBattle as any;
  return `${battle?.battleType ?? "battle"}:${battle?.waveIndex ?? "unknown"}`;
}

function getDeltaStreamSideData(): DeltaStreamSideData {
  const battleKey = getCurrentBattleKey();
  const globals = globalThis as any;

  if (!globals.__lavarogueDeltaStreamData || globals.__lavarogueDeltaStreamData.battleKey !== battleKey) {
    globals.__lavarogueDeltaStreamData = {
      battleKey,
      playerRounds: 0,
      enemyRounds: 0,
    } satisfies DeltaStreamSideData;
  }

  return globals.__lavarogueDeltaStreamData;
}

function isPlayerSide(pokemon: Pokemon): boolean {
  return pokemon.isPlayer();
}

function getRoundCountForSide(pokemon: Pokemon): number {
  const data = getDeltaStreamSideData();
  return isPlayerSide(pokemon) ? data.playerRounds : data.enemyRounds;
}

function fieldSideHasDeltaStream(isPlayer: boolean): boolean {
  if (!isBuffedDeltaStreamActive()) {
    return false;
  }

  return globalScene
    .getField(true)
    .some(fieldPokemon => fieldPokemon.isPlayer() === isPlayer && fieldPokemon.hasAbility(AbilityId.DELTA_STREAM));
}

function sideHasDeltaStream(pokemon: Pokemon): boolean {
  return fieldSideHasDeltaStream(pokemon.isPlayer());
}

function incrementDeltaStreamSpeedRounds(): void {
  const data = getDeltaStreamSideData();

  if (fieldSideHasDeltaStream(true)) {
    data.playerRounds += 1;
  } else {
    data.playerRounds = 0;
  }

  if (fieldSideHasDeltaStream(false)) {
    data.enemyRounds += 1;
  } else {
    data.enemyRounds = 0;
  }
}

function getDeltaStreamSpeedMultiplier(pokemon: Pokemon): number {
  if (!sideHasDeltaStream(pokemon)) {
    return 1;
  }

  const rounds = Math.max(getRoundCountForSide(pokemon), 1);
  const speedBonus = Math.min(
    DELTA_STREAM_BASE_SPEED_BONUS + (rounds - 1) * DELTA_STREAM_SPEED_BONUS_PER_ROUND,
    DELTA_STREAM_MAX_SPEED_BONUS,
  );

  return 1 + speedBonus;
}

const originalTurnStart = TurnStartPhase.prototype.start;
TurnStartPhase.prototype.start = function startBuffedDeltaStreamRound(): void {
  incrementDeltaStreamSpeedRounds();
  originalTurnStart.call(this);
};

const originalTrySetWeather = Arena.prototype.trySetWeather;
Arena.prototype.trySetWeather = function trySetBuffedDeltaStreamWeather(weather: WeatherType, user?: Pokemon): boolean {
  if (
    this.weather?.weatherType === WeatherType.STRONG_WINDS
    && weather !== WeatherType.NONE
    && weather !== WeatherType.STRONG_WINDS
  ) {
    return false;
  }

  return originalTrySetWeather.call(this, weather, user);
};

const originalCalculateBattlePower = Move.prototype.calculateBattlePower;
Move.prototype.calculateBattlePower = function calculateBuffedDeltaStreamBattlePower(
  source: Pokemon,
  target: Pokemon,
  simulated = false,
): number {
  let power = originalCalculateBattlePower.call(this, source, target, simulated);

  if (power > 0 && sideHasDeltaStream(source) && DELTA_STREAM_BOOSTED_TYPES.has(source.getMoveType(this))) {
    power = Math.max(Math.floor(power * DELTA_STREAM_DAMAGE_MULTIPLIER), 1);
  }

  return power;
};

const originalGetEffectiveStat = Pokemon.prototype.getEffectiveStat;
Pokemon.prototype.getEffectiveStat = function getBuffedDeltaStreamEffectiveStat(
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

  if (stat === Stat.SPD && sideHasDeltaStream(this)) {
    statValue *= getDeltaStreamSpeedMultiplier(this);
  }

  return Math.max(Math.floor(statValue), 1);
};

const originalGetStatStage = Pokemon.prototype.getStatStage;
Pokemon.prototype.getStatStage = function getBuffedDeltaStreamStatStage(stat: any): number {
  const stage = originalGetStatStage.call(this, stat);

  if (stat === Stat.EVA && sideHasDeltaStream(this)) {
    return Math.min(stage + DELTA_STREAM_EVASION_STAGE_BONUS, 6);
  }

  return stage;
};

const originalGetAttackTypeEffectiveness = Pokemon.prototype.getAttackTypeEffectiveness;
Pokemon.prototype.getAttackTypeEffectiveness = function getBuffedDeltaStreamAttackTypeEffectiveness(
  moveType: PokemonType,
  params: any = {},
) {
  const effectiveness = originalGetAttackTypeEffectiveness.call(this, moveType, params);

  if (
    sideHasDeltaStream(this)
    && !params.ignoreStrongWinds
    && !this.isOfType(PokemonType.FLYING)
    && DELTA_STREAM_SUPPRESSED_TYPES.has(moveType)
    && effectiveness > 1
  ) {
    return Math.max(effectiveness / 2, 1);
  }

  return effectiveness;
};

const originalCalculateBattleAccuracy = Move.prototype.calculateBattleAccuracy;
Move.prototype.calculateBattleAccuracy = function calculateBuffedDeltaStreamBattleAccuracy(
  user: Pokemon,
  target: Pokemon,
  simulated = false,
) {
  const accuracy = originalCalculateBattleAccuracy.call(this, user, target, simulated);

  if (accuracy === -1 || this.category === MoveCategory.STATUS || !sideHasDeltaStream(target)) {
    return accuracy;
  }

  const moveType = user.getMoveType(this);
  if (
    target.isOfType(PokemonType.FLYING)
    && DELTA_STREAM_SUPPRESSED_TYPES.has(moveType)
    && getTypeDamageMultiplier(moveType, PokemonType.FLYING) === 2
  ) {
    return Math.floor(accuracy * 0.75);
  }

  return accuracy;
};
