/*
 * LavaRogue custom balance patch: Celestial Ascent and Stellar Delta Stream buffs.
 */

import { globalScene } from "#app/global-scene";
import { allMoves } from "#data/data-lists";
import { AbilityId } from "#enums/ability-id";
import { PokemonType } from "#enums/pokemon-type";
import { SpeciesId } from "#enums/species-id";
import { WeatherType } from "#enums/weather-type";
import { Pokemon } from "#field/pokemon";
import { Move } from "#moves/move";
import { LAVAROGUE_MOVE_IDS } from "./lavarogue-custom-moves";

const CELESTIAL_ASCENT_POWER = 180;
const DRAGON_EMPEROR_CELESTIAL_ASCENT_MULTIPLIER = 1.5;
const DELTA_STREAM_STELLAR_DAMAGE_MULTIPLIER = 1.55;

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

function setCelestialAscentPower(): void {
  const celestialAscentId = LAVAROGUE_MOVE_IDS.CELESTIAL_ASCENT;
  const celestialAscent = (allMoves as unknown as Move[])[celestialAscentId];

  if (celestialAscent) {
    celestialAscent.power = CELESTIAL_ASCENT_POWER;
  }
}

export function initLavaRogueCelestialAscentBuffs(): void {
  const installKey = "__lavarogueCelestialAscentBuffsInstalled";
  if ((globalThis as any)[installKey]) {
    setCelestialAscentPower();
    return;
  }
  (globalThis as any)[installKey] = true;

  setCelestialAscentPower();

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
}
