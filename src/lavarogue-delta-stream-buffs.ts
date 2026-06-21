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

const DELTA_STREAM_SUPPRESSED_TYPES = new Set<PokemonType>([
  PokemonType.ROCK,
  PokemonType.ELECTRIC,
  PokemonType.ICE,
]);

const DELTA_STREAM_BOOSTED_TYPES = new Set<PokemonType>([
  PokemonType.FLYING,
  PokemonType.DRAGON,
]);

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
    power = Math.max(Math.floor(power * 1.25), 1);
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
    statValue *= 1.5;
  }

  return Math.max(Math.floor(statValue), 1);
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
