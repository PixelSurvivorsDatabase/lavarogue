/*
 * LavaRogue custom moves and fork-only balance patches.
 *
 * Keeps custom fork-only changes isolated from generated upstream data files.
 */

import { globalScene } from "#app/global-scene";
import { getPokemonNameWithAffix } from "#app/messages";
import { speciesEggMoves } from "#balance/moves/egg-moves";
import { allMoves } from "#data/data-lists";
import { BattlerTagType } from "#enums/battler-tag-type";
import { MoveCategory } from "#enums/move-category";
import { MoveId } from "#enums/move-id";
import { PokemonType } from "#enums/pokemon-type";
import { SpeciesId } from "#enums/species-id";
import { Stat } from "#enums/stat";
import { Pokemon } from "#field/pokemon";
import { BerryModifier } from "#modifiers/modifier";
import { AttackMove, Move, SelfStatusMove, StatStageChangeAttr } from "#moves/move";
import { TurnStartPhase } from "#phases/turn-start-phase";
import i18next from "i18next";

const DRACO_DANCE_NAME = "Draco Dance";
const DRACO_DANCE_EFFECT = "The user performs a mystical draconic dance, boosting its Sp. Atk and Speed stats.";

const CELESTIAL_ASCENT_NAME = "Celestial Ascent";
const CELESTIAL_ASCENT_EFFECT =
  "The user flies up and strikes down on the target, leaving a rainbow trail. This Stellar-type move is super effective against Dark, Poison, Psychic, Fighting, Ghost, Dragon, and Steel types.";
const CELESTIAL_ASCENT_SUPER_EFFECTIVE_TYPES = [
  PokemonType.DARK,
  PokemonType.POISON,
  PokemonType.PSYCHIC,
  PokemonType.FIGHTING,
  PokemonType.GHOST,
  PokemonType.DRAGON,
  PokemonType.STEEL,
] as const;

const DRAGON_EMPEROR_NAME = "Dragon Emperor";
const DRAGON_EMPEROR_DAMAGE_MULTIPLIER = 1.5;
const DRAGON_EMPEROR_ACCURACY_MULTIPLIER = 1.5;
const DRAGON_EMPEROR_DEFENSE_BOOST_PER_KO = 0.1;
const DRAGON_EMPEROR_MAX_DEFENSE_BOOSTS = 6;
const DRAGON_EMPEROR_FLINCH_CHANCE = 8;
const DRAGON_EMPEROR_LEVEL_GRACE = 3;
const DRAGON_EMPEROR_PULSE_BASE_PERCENT = 0.1;
const DRAGON_EMPEROR_PULSE_STACK_PERCENT = 0.05;
const DRAGON_EMPEROR_PULSE_STACK_INTERVAL = 2;

export const LAVAROGUE_MOVE_IDS: Record<string, MoveId> = {};

type DragonEmperorBattleData = {
  battleKey: string;
  defenseBoosts: number;
  pulseCount: number;
};

function addRuntimeMoveId(name: string): MoveId {
  if (LAVAROGUE_MOVE_IDS[name] !== undefined) {
    return LAVAROGUE_MOVE_IDS[name];
  }

  const customMoveCount = Object.keys(LAVAROGUE_MOVE_IDS).length;
  const id = ((allMoves as unknown as unknown[]).length + customMoveCount) as MoveId;
  const moveIdMap = MoveId as unknown as Record<string | number, string | number>;

  moveIdMap[name] = id;
  moveIdMap[id] = name;
  LAVAROGUE_MOVE_IDS[name] = id;

  return id;
}

function addCustomMoveText(): void {
  const languages = new Set(["en", "en-US", i18next.language].filter(Boolean));

  for (const language of languages) {
    i18next.addResource(language, "move", "dracoDance.name", DRACO_DANCE_NAME);
    i18next.addResource(language, "move", "dracoDance.effect", DRACO_DANCE_EFFECT);

    i18next.addResource(language, "move", "celestialAscent.name", CELESTIAL_ASCENT_NAME);
    i18next.addResource(language, "move", "celestialAscent.effect", CELESTIAL_ASCENT_EFFECT);
  }
}

function isMegaRayquaza(pokemon?: Pokemon | null): pokemon is Pokemon {
  return !!pokemon && pokemon.species?.speciesId === SpeciesId.RAYQUAZA && pokemon.isMega();
}

function hasDragonEmperor(pokemon?: Pokemon | null): pokemon is Pokemon {
  return isMegaRayquaza(pokemon) && !!pokemon.passive;
}

function getCurrentBattleKey(): string {
  const battle = globalScene?.currentBattle as any;
  return `${battle?.battleType ?? "battle"}:${battle?.waveIndex ?? globalScene?.currentBattle?.waveIndex ?? "unknown"}`;
}

function getDragonEmperorBattleData(pokemon: Pokemon): DragonEmperorBattleData {
  const battleKey = getCurrentBattleKey();
  const anyPokemon = pokemon as any;

  if (!anyPokemon.__lavarogueDragonEmperorData || anyPokemon.__lavarogueDragonEmperorData.battleKey !== battleKey) {
    anyPokemon.__lavarogueDragonEmperorData = {
      battleKey,
      defenseBoosts: 0,
      pulseCount: 0,
    } satisfies DragonEmperorBattleData;
  }

  if (anyPokemon.__lavarogueDragonEmperorData.pulseCount === undefined) {
    anyPokemon.__lavarogueDragonEmperorData.pulseCount = 0;
  }

  return anyPokemon.__lavarogueDragonEmperorData;
}

function getActiveOpposingDragonEmperor(pokemon: Pokemon): Pokemon | undefined {
  return globalScene
    ?.getField(true)
    ?.find(fieldPokemon => fieldPokemon.isPlayer() !== pokemon.isPlayer() && hasDragonEmperor(fieldPokemon));
}

function queueDragonEmperorAbilityDisplay(pokemon: Pokemon): void {
  const anyPokemon = pokemon as any;
  const originalGetPassiveAbility = anyPokemon.getPassiveAbility;

  // ShowAbilityPhase captures the name immediately, so this only affects the queued popup.
  anyPokemon.getPassiveAbility = () => ({ name: DRAGON_EMPEROR_NAME, id: -999 });
  try {
    globalScene.phaseManager.queueAbilityDisplay(pokemon, true, true);
  } finally {
    anyPokemon.getPassiveAbility = originalGetPassiveAbility;
  }
}

function queueDragonEmperorTrigger(pokemon: Pokemon, messages: string[]): void {
  queueDragonEmperorAbilityDisplay(pokemon);
  for (const message of messages) {
    globalScene.phaseManager.queueMessage(message);
  }
  globalScene.phaseManager.queueAbilityDisplay(pokemon, true, false);
}

function addDragonEmperorDefenseBoost(pokemon: Pokemon): number {
  const data = getDragonEmperorBattleData(pokemon);
  data.defenseBoosts = Math.min(data.defenseBoosts + 1, DRAGON_EMPEROR_MAX_DEFENSE_BOOSTS);
  return data.defenseBoosts;
}

function getDragonEmperorDefenseMultiplier(pokemon: Pokemon): number {
  if (!hasDragonEmperor(pokemon)) {
    return 1;
  }

  const boosts = getDragonEmperorBattleData(pokemon).defenseBoosts;
  return 1 + boosts * DRAGON_EMPEROR_DEFENSE_BOOST_PER_KO;
}

function tryDragonEmperorFlinch(user: Pokemon): boolean {
  const emperor = getActiveOpposingDragonEmperor(user);
  if (!emperor || user.level >= emperor.level + DRAGON_EMPEROR_LEVEL_GRACE) {
    return false;
  }

  if (globalScene.randBattleSeedInt(DRAGON_EMPEROR_FLINCH_CHANCE) !== 0) {
    return false;
  }

  const flinched = user.addTag(BattlerTagType.FLINCHED, 1, undefined, emperor.id);
  if (flinched) {
    queueDragonEmperorTrigger(emperor, [
      `${getPokemonNameWithAffix(user)} flinched because of ${getPokemonNameWithAffix(emperor)}'s Terrifying Aura!`,
    ]);
  }

  return flinched;
}

function getCelestialAscentEffectiveness(target: Pokemon): number {
  return CELESTIAL_ASCENT_SUPER_EFFECTIVE_TYPES.reduce(
    (multiplier, type) => multiplier * (target.isOfType(type) ? 2 : 1),
    1,
  );
}

function getDragonEmperorPulsePercent(emperor: Pokemon): number {
  const pulseCount = Math.max(getDragonEmperorBattleData(emperor).pulseCount, 1);
  const stackCount = Math.floor((pulseCount - 1) / DRAGON_EMPEROR_PULSE_STACK_INTERVAL);
  return DRAGON_EMPEROR_PULSE_BASE_PERCENT + stackCount * DRAGON_EMPEROR_PULSE_STACK_PERCENT;
}

function isDragonEmperorPulseImmune(target: Pokemon): boolean {
  return target.isOfType(PokemonType.FAIRY);
}

function isDragonEmperorPulseResisted(target: Pokemon): boolean {
  return target.isOfType(PokemonType.STEEL)
    || target.isOfType(PokemonType.ROCK)
    || target.isOfType(PokemonType.GROUND);
}

function calculateDragonEmperorPulseDamage(emperor: Pokemon, target: Pokemon): number {
  if (target.hp <= 1 || isDragonEmperorPulseImmune(target)) {
    return 0;
  }

  let percent = getDragonEmperorPulsePercent(emperor);
  if (isDragonEmperorPulseResisted(target)) {
    percent /= 2;
  }

  return Math.min(Math.max(Math.ceil(target.hp * percent), 1), target.hp - 1);
}

function applyDragonEmperorPulse(emperor: Pokemon): void {
  if (!hasDragonEmperor(emperor) || emperor.isFainted()) {
    return;
  }

  const targets = globalScene
    .getField(true)
    .filter(target => target.isPlayer() !== emperor.isPlayer() && !target.isFainted());

  if (!targets.length) {
    return;
  }

  const data = getDragonEmperorBattleData(emperor);
  data.pulseCount += 1;

  const pulsePercent = Math.round(getDragonEmperorPulsePercent(emperor) * 100);
  queueDragonEmperorTrigger(emperor, [
    `${getPokemonNameWithAffix(emperor)} released an Imperial Pulse! (${pulsePercent}% current HP true damage)`,
  ]);

  for (const target of targets) {
    const damage = calculateDragonEmperorPulseDamage(emperor, target);
    if (damage <= 0) {
      if (isDragonEmperorPulseImmune(target)) {
        globalScene.phaseManager.queueMessage(`${getPokemonNameWithAffix(target)} was immune to the Imperial Pulse!`);
      }
      continue;
    }

    target.damageAndUpdate(damage, {
      source: emperor,
      ignoreSegments: true,
    });
    target.updateInfo?.(true);
  }
}

function applyDragonEmperorPulses(): void {
  for (const emperor of globalScene.getField(true).filter(hasDragonEmperor)) {
    applyDragonEmperorPulse(emperor);
  }
}

function initDragonEmperorPassive(): void {
  const installKey = "__lavarogueDragonEmperorInstalled";
  if ((globalThis as any)[installKey]) {
    return;
  }
  (globalThis as any)[installKey] = true;

  const originalTurnStart = TurnStartPhase.prototype.start;
  TurnStartPhase.prototype.start = function startDragonEmperorPulseTurn(): void {
    applyDragonEmperorPulses();
    originalTurnStart.call(this);
  };

  const originalCalculateBattlePower = Move.prototype.calculateBattlePower;
  Move.prototype.calculateBattlePower = function calculateDragonEmperorBattlePower(
    source: Pokemon,
    target: Pokemon,
    simulated = false,
  ): number {
    let power = originalCalculateBattlePower.call(this, source, target, simulated);

    if (power > 0 && hasDragonEmperor(source) && source.getMoveType(this) === PokemonType.DRAGON) {
      power = Math.floor(power * DRAGON_EMPEROR_DAMAGE_MULTIPLIER);
    }

    return power;
  };

  const originalCalculateBattleAccuracy = Move.prototype.calculateBattleAccuracy;
  Move.prototype.calculateBattleAccuracy = function calculateDragonEmperorBattleAccuracy(
    user: Pokemon,
    target: Pokemon,
    simulated = false,
  ): number {
    const accuracy = originalCalculateBattleAccuracy.call(this, user, target, simulated);

    if (
      accuracy !== -1
      && this.category !== MoveCategory.STATUS
      && hasDragonEmperor(user)
      && user.getMoveType(this) === PokemonType.DRAGON
    ) {
      return Math.floor(accuracy * DRAGON_EMPEROR_ACCURACY_MULTIPLIER);
    }

    return accuracy;
  };

  const originalGetAttackTypeEffectiveness = Pokemon.prototype.getAttackTypeEffectiveness;
  Pokemon.prototype.getAttackTypeEffectiveness = function getDragonEmperorAttackTypeEffectiveness(
    moveType: PokemonType,
    params: any = {},
  ) {
    const effectiveness = originalGetAttackTypeEffectiveness.call(this, moveType, params);
    const source = params?.source as Pokemon | undefined;
    const move = params?.move as Move | undefined;

    // Celestial Ascent uses Stellar typing, but has a custom super-effective type chart.
    if (move?.id === LAVAROGUE_MOVE_IDS.CELESTIAL_ASCENT) {
      return Math.max(effectiveness, getCelestialAscentEffectiveness(this));
    }

    // Dragon Emperor lets Mega Rayquaza's Dragon moves hit Fairy-types neutrally instead of doing no damage.
    if (moveType === PokemonType.DRAGON && hasDragonEmperor(source) && this.isOfType(PokemonType.FAIRY)) {
      return effectiveness === 0 ? 1 : effectiveness;
    }

    // Dragon Emperor makes Fairy attacks neutral into Mega Rayquaza instead of super effective.
    if (moveType === PokemonType.FAIRY && hasDragonEmperor(this)) {
      return 1;
    }

    return effectiveness;
  };

  const originalGetEffectiveStat = Pokemon.prototype.getEffectiveStat;
  Pokemon.prototype.getEffectiveStat = function getDragonEmperorEffectiveStat(
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

    if ((stat === Stat.DEF || stat === Stat.SPDEF) && hasDragonEmperor(this)) {
      statValue *= getDragonEmperorDefenseMultiplier(this);
    }

    return Math.max(Math.floor(statValue), 1);
  };

  const originalDamageAndUpdate = Pokemon.prototype.damageAndUpdate;
  Pokemon.prototype.damageAndUpdate = function damageAndUpdateDragonEmperorTracker(
    damage: number,
    params: any = {},
  ): number {
    const wasFainted = this.isFainted();
    const result = originalDamageAndUpdate.call(this, damage, params);
    const source = params?.source as Pokemon | undefined;

    if (!wasFainted && this.isFainted() && hasDragonEmperor(source) && source.isOpponent(this)) {
      const defenseBoosts = addDragonEmperorDefenseBoost(source);
      const boostPercent = Math.round(defenseBoosts * DRAGON_EMPEROR_DEFENSE_BOOST_PER_KO * 100);

      queueDragonEmperorTrigger(source, [
        `${getPokemonNameWithAffix(source)}'s stats were boosted because of Dragon Emperor!`,
        `${getPokemonNameWithAffix(source)}'s Defense and Sp. Def rose by 10%! (${boostPercent}% total, max 60%)`,
      ]);
      source.updateInfo?.(true);
    }

    return result;
  };

  const originalBerryShouldApply = BerryModifier.prototype.shouldApply;
  BerryModifier.prototype.shouldApply = function dragonEmperorBerrySuppression(pokemon: Pokemon): boolean {
    if (pokemon && getActiveOpposingDragonEmperor(pokemon)) {
      return false;
    }

    return originalBerryShouldApply.call(this, pokemon);
  };

  const originalApplyConditions = Move.prototype.applyConditions;
  Move.prototype.applyConditions = function applyDragonEmperorAuraConditions(
    user: Pokemon,
    target: Pokemon,
    sequence: -1 | 2 | 3 | 4 = 4,
  ): boolean {
    if (sequence === 4 && tryDragonEmperorFlinch(user)) {
      return false;
    }

    return originalApplyConditions.call(this, user, target, sequence);
  };
}

export function initLavaRogueCustomMoves(): void {
  addCustomMoveText();
  initDragonEmperorPassive();

  const dracoDanceId = addRuntimeMoveId("DRACO_DANCE");
  const celestialAscentId = addRuntimeMoveId("CELESTIAL_ASCENT");

  const dracoDance = new SelfStatusMove(dracoDanceId, PokemonType.DRAGON, -1, 20, -1, 0, 9)
    .attr(StatStageChangeAttr, [Stat.SPATK, Stat.SPD], 1, true)
    .danceMove();

  dracoDance.localize();

  // Fallback for places that read the Move object directly before/without i18next resolving custom keys.
  dracoDance.name = DRACO_DANCE_NAME;
  dracoDance.effect = DRACO_DANCE_EFFECT;

  const celestialAscent = new AttackMove(
    celestialAscentId,
    PokemonType.STELLAR,
    MoveCategory.PHYSICAL,
    140,
    80,
    5,
    -1,
    0,
    9,
  ).windMove();

  celestialAscent.localize();
  celestialAscent.name = CELESTIAL_ASCENT_NAME;
  celestialAscent.effect = CELESTIAL_ASCENT_EFFECT;

  (allMoves as unknown as Array<typeof dracoDance | typeof celestialAscent>).push(dracoDance, celestialAscent);

  // Rayquaza already has Nasty Plot as egg move #2. Replace it with Draco Dance so unlocked Rayquaza gets it immediately.
  // Celestial Ascent replaces Dragon Darts as the rare/custom offensive egg move.
  (speciesEggMoves as any)[SpeciesId.RAYQUAZA] = [
    MoveId.V_CREATE,
    dracoDanceId,
    MoveId.CORE_ENFORCER,
    celestialAscentId,
  ];
}
