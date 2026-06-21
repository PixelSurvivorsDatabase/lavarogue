/*
 * LavaRogue custom form: Cosmic Fear Rayquaza.
 *
 * Phase 1 implementation:
 * - Adds the Cosmic Rayquaza form data.
 * - Adds Nuclear Fission and Singularity as runtime moves.
 * - Adds Cosmic Dread / Event Horizon field mechanics.
 * - Adds lava.cosmicRay() dev helper.
 *
 * Sprite assets still need to be copied into the local asset folder as 384-cosmic.png/json.
 */

import { globalScene } from "#app/global-scene";
import { getPokemonNameWithAffix } from "#app/messages";
import { allMoves } from "#data/data-lists";
import { PokemonForm } from "#data/pokemon-species";
import { AbilityId } from "#enums/ability-id";
import { BattlerTagType } from "#enums/battler-tag-type";
import { HitResult } from "#enums/hit-result";
import { MoveCategory } from "#enums/move-category";
import { MoveFlags } from "#enums/move-flags";
import { MoveId } from "#enums/move-id";
import { MoveTarget } from "#enums/move-target";
import { PokemonType } from "#enums/pokemon-type";
import { SpeciesId } from "#enums/species-id";
import { Stat } from "#enums/stat";
import { StatusEffect } from "#enums/status-effect";
import { Pokemon } from "#field/pokemon";
import { PokemonMove } from "#moves/pokemon-move";
import { AttackMove, Move, MoveEffectAttr } from "#moves/move";
import { MovePhase } from "#phases/move-phase";
import { TurnStartPhase } from "#phases/turn-start-phase";
import { getPokemonSpecies } from "#utils/pokemon-utils";
import i18next from "i18next";
import { LAVAROGUE_MOVE_IDS } from "./lavarogue-custom-moves";

export const COSMIC_RAYQUAZA_FORM_KEY = "cosmic";
const COSMIC_DREAD_NAME = "Cosmic Dread";
const EVENT_HORIZON_NAME = "Event Horizon";
const RADIATION_PRESSURE_NAME = "Radiation Pressure";

const NUCLEAR_FISSION_NAME = "Nuclear Fission";
const NUCLEAR_FISSION_EFFECT =
  "The user drags the target through a cosmic portal, detonates a nuclear blast, hits every Pokémon, lowers their stats, and accelerates Radiation Pressure.";
const SINGULARITY_NAME = "Singularity";
const SINGULARITY_EFFECT =
  "The user releases a condensed cosmic orb that erupts into a massive beam. This Stellar-type attack is super effective against everything.";

const COSMIC_DREAD_FLINCH_CHANCE = 6;
const CONTACT_TAX_PERCENT = 1 / 16;
const RADIATION_BASE_PERCENT = 1 / 16;
const RADIATION_DECAY_BASE = 0.05;
const RADIATION_DECAY_CAP = 0.75;
const ACCRETION_DISC_DAMAGE_PERCENT = 1 / 32;
const ACCRETION_DISC_BURN_CHANCE = 5; // 1 / 5 = 20%
const STATUS_ABSORB_HEAL_PERCENT = 1 / 16;
const LENSING_DAMAGE_MULTIPLIER = 1.35; // Phase 1: damage-equivalent echo; true replay animation can come later.

const COSMIC_FORM_STATS = {
  hp: 175,
  atk: 220,
  def: 150,
  spatk: 255,
  spdef: 150,
  spd: 145,
};

const NUCLEAR_FISSION_SUPER_EFFECTIVE_TYPES = [
  PokemonType.FIRE,
  PokemonType.GROUND,
  PokemonType.ROCK,
  PokemonType.ICE,
  PokemonType.STEEL,
  PokemonType.FLYING,
  PokemonType.NORMAL,
  PokemonType.FIGHTING,
  PokemonType.GHOST,
  PokemonType.DARK,
  PokemonType.FAIRY,
  PokemonType.PSYCHIC,
  PokemonType.BUG,
  PokemonType.GRASS,
  PokemonType.WATER,
  PokemonType.DRAGON,
] as const;

type CosmicBattleData = {
  battleKey: string;
  radiationTurn: number;
  radiationBoosts: number;
  statDecay: number;
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

function addCosmicText(): void {
  const languages = new Set(["en", "en-US", i18next.language].filter(Boolean));

  for (const language of languages) {
    i18next.addResource(language, "move", "nuclearFission.name", NUCLEAR_FISSION_NAME);
    i18next.addResource(language, "move", "nuclearFission.effect", NUCLEAR_FISSION_EFFECT);
    i18next.addResource(language, "move", "singularity.name", SINGULARITY_NAME);
    i18next.addResource(language, "move", "singularity.effect", SINGULARITY_EFFECT);
    i18next.addResource(language, "pokemonForm", "rayquazaCosmic", "Cosmic Fear Form");
  }
}

function getCurrentBattleKey(): string {
  const battle = globalScene?.currentBattle as any;
  return `${battle?.battleType ?? "battle"}:${battle?.waveIndex ?? "unknown"}`;
}

export function isCosmicRayquaza(pokemon?: Pokemon | null): pokemon is Pokemon {
  return !!pokemon && pokemon.species?.speciesId === SpeciesId.RAYQUAZA && pokemon.getFormKey?.() === COSMIC_RAYQUAZA_FORM_KEY;
}

function getActiveCosmicRayquaza(): Pokemon | undefined {
  return globalScene?.getField(true)?.find(isCosmicRayquaza);
}

function getActiveCosmicRayquazas(): Pokemon[] {
  return globalScene?.getField(true)?.filter(isCosmicRayquaza) ?? [];
}

function getCosmicBattleData(cfr: Pokemon): CosmicBattleData {
  const battleKey = getCurrentBattleKey();
  const anyPokemon = cfr as any;

  if (!anyPokemon.__lavarogueCosmicRayquazaData || anyPokemon.__lavarogueCosmicRayquazaData.battleKey !== battleKey) {
    anyPokemon.__lavarogueCosmicRayquazaData = {
      battleKey,
      radiationTurn: 0,
      radiationBoosts: 0,
      statDecay: 0,
    } satisfies CosmicBattleData;
  }

  return anyPokemon.__lavarogueCosmicRayquazaData;
}

function getTargetRadiationData(target: Pokemon, cfr: Pokemon): CosmicBattleData {
  const battleKey = getCurrentBattleKey();
  const anyPokemon = target as any;
  const key = `__lavarogueRadiationPressure_${cfr.id}`;

  if (!anyPokemon[key] || anyPokemon[key].battleKey !== battleKey) {
    anyPokemon[key] = {
      battleKey,
      radiationTurn: 0,
      radiationBoosts: 0,
      statDecay: 0,
    } satisfies CosmicBattleData;
  }

  return anyPokemon[key];
}

function getSpaghettificationMultiplier(target: Pokemon): number {
  const hpRatio = target.getHpRatio(true);
  if (hpRatio <= 0.25) {
    return 2;
  }
  if (hpRatio <= 0.5) {
    return 1.5;
  }
  if (hpRatio <= 0.75) {
    return 1.25;
  }
  return 1;
}

function getRadiationExponent(data: CosmicBattleData): number {
  return Math.floor(Math.max(data.radiationTurn - 1, 0) / 2) + data.radiationBoosts;
}

function getRadiationDamagePercent(data: CosmicBattleData): number {
  return RADIATION_BASE_PERCENT * 2 ** getRadiationExponent(data);
}

function getRadiationDecayIncrement(data: CosmicBattleData): number {
  return RADIATION_DECAY_BASE * 2 ** getRadiationExponent(data);
}

function applyIndirectDamage(target: Pokemon, amount: number, source?: Pokemon): number {
  if (amount <= 0 || target.isFainted()) {
    return 0;
  }

  const damage = Math.min(Math.max(Math.ceil(amount), 1), target.hp);
  const dealt = target.damageAndUpdate(damage, {
    result: HitResult.INDIRECT,
    ignoreSegments: true,
    source,
  });
  target.updateInfo?.(true);
  return dealt;
}

function applyRadiationPressure(cfr: Pokemon): void {
  if (!isCosmicRayquaza(cfr) || cfr.isFainted()) {
    return;
  }

  const cosmicData = getCosmicBattleData(cfr);
  cosmicData.radiationTurn += 1;

  const targets = globalScene.getField(true).filter(pokemon => pokemon !== cfr && !pokemon.isFainted());
  if (!targets.length) {
    return;
  }

  const percent = getRadiationDamagePercent(cosmicData);
  const percentText = Math.round(percent * 1000) / 10;
  globalScene.phaseManager.queueMessage(
    `${getPokemonNameWithAffix(cfr)}'s ${RADIATION_PRESSURE_NAME} crushed the field! (${percentText}% max HP)`,
  );

  for (const target of targets) {
    const targetData = getTargetRadiationData(target, cfr);
    targetData.radiationTurn = cosmicData.radiationTurn;
    targetData.radiationBoosts = cosmicData.radiationBoosts;
    targetData.statDecay = Math.min(
      RADIATION_DECAY_CAP,
      targetData.statDecay + getRadiationDecayIncrement(cosmicData),
    );

    const damage = target.getMaxHp() * percent * getSpaghettificationMultiplier(target);
    applyIndirectDamage(target, damage, cfr);
  }
}

function applyAccretionDisc(cfr: Pokemon): void {
  if (!isCosmicRayquaza(cfr) || cfr.isFainted()) {
    return;
  }

  const targets = globalScene
    .getField(true)
    .filter(target => target.isPlayer() !== cfr.isPlayer() && !target.isFainted());

  for (const target of targets) {
    const heatDamage = target.getMaxHp() * ACCRETION_DISC_DAMAGE_PERCENT * getSpaghettificationMultiplier(target);
    applyIndirectDamage(target, heatDamage, cfr);

    if (!target.status && !target.isOfType(PokemonType.FIRE) && globalScene.randBattleSeedInt(ACCRETION_DISC_BURN_CHANCE) === 0) {
      target.doSetStatus(StatusEffect.BURN);
      target.updateInfo?.(true);
      globalScene.phaseManager.queueMessage(`${getPokemonNameWithAffix(target)} was burned by ${EVENT_HORIZON_NAME}'s accretion disc!`);
    }
  }
}

function applyGravitationalBinding(cfr: Pokemon): void {
  for (const target of globalScene.getField(true).filter(pokemon => pokemon !== cfr && !pokemon.isFainted())) {
    target.addTag(BattlerTagType.TRAPPED, 1, undefined, cfr.id);
  }
}

function getRadiationStatMultiplier(target: Pokemon): number {
  let strongestDecay = 0;
  const anyPokemon = target as any;

  for (const key of Object.keys(anyPokemon)) {
    if (key.startsWith("__lavarogueRadiationPressure_")) {
      const data = anyPokemon[key] as CosmicBattleData;
      if (data?.battleKey === getCurrentBattleKey()) {
        strongestDecay = Math.max(strongestDecay, data.statDecay ?? 0);
      }
    }
  }

  return Math.max(0.25, 1 - strongestDecay);
}

function tryCosmicDreadFlinch(user: Pokemon): boolean {
  if (isCosmicRayquaza(user)) {
    return false;
  }

  const cfr = getActiveCosmicRayquaza();
  if (!cfr || globalScene.randBattleSeedInt(COSMIC_DREAD_FLINCH_CHANCE) !== 0) {
    return false;
  }

  const flinched = user.addTag(BattlerTagType.FLINCHED, 1, undefined, cfr.id);
  if (flinched) {
    globalScene.phaseManager.queueMessage(`${getPokemonNameWithAffix(user)} froze under ${getPokemonNameWithAffix(cfr)}'s ${COSMIC_DREAD_NAME}!`);
  }
  return flinched;
}

function installCosmicForm(): void {
  const rayquaza = getPokemonSpecies(SpeciesId.RAYQUAZA);
  if (rayquaza.forms.some(form => form.formKey === COSMIC_RAYQUAZA_FORM_KEY)) {
    return;
  }

  const cosmicForm = new PokemonForm({
    formName: "Cosmic Fear Rayquaza",
    formKey: COSMIC_RAYQUAZA_FORM_KEY,
    formSpriteKey: COSMIC_RAYQUAZA_FORM_KEY,
    type1: PokemonType.DRAGON,
    type2: PokemonType.STELLAR,
    height: rayquaza.height,
    weight: rayquaza.weight,
    ability1: AbilityId.NONE,
    ability2: AbilityId.NONE,
    abilityHidden: AbilityId.NONE,
    baseTotal:
      COSMIC_FORM_STATS.hp
      + COSMIC_FORM_STATS.atk
      + COSMIC_FORM_STATS.def
      + COSMIC_FORM_STATS.spatk
      + COSMIC_FORM_STATS.spdef
      + COSMIC_FORM_STATS.spd,
    baseHp: COSMIC_FORM_STATS.hp,
    baseAtk: COSMIC_FORM_STATS.atk,
    baseDef: COSMIC_FORM_STATS.def,
    baseSpatk: COSMIC_FORM_STATS.spatk,
    baseSpdef: COSMIC_FORM_STATS.spdef,
    baseSpd: COSMIC_FORM_STATS.spd,
    catchRate: rayquaza.catchRate,
    baseFriendship: rayquaza.baseFriendship,
    baseExp: rayquaza.baseExp,
    genderDiffs: false,
    isStarterSelectable: true,
    isUnobtainable: false,
  });

  cosmicForm.speciesId = SpeciesId.RAYQUAZA;
  cosmicForm.formIndex = rayquaza.forms.length;
  cosmicForm.generation = rayquaza.generation;
  rayquaza.forms.push(cosmicForm);
}

function getCosmicFormIndex(): number {
  return getPokemonSpecies(SpeciesId.RAYQUAZA).forms.findIndex(form => form.formKey === COSMIC_RAYQUAZA_FORM_KEY);
}

async function transformToCosmicRayquaza(rayquaza: Pokemon): Promise<Pokemon> {
  const formIndex = getCosmicFormIndex();
  if (formIndex < 0) {
    throw new Error("Cosmic Rayquaza form is not installed.");
  }

  rayquaza.formIndex = formIndex;
  rayquaza.abilityIndex = 0;
  rayquaza.passive = true;
  rayquaza.generateName();
  rayquaza.calculateStats();
  rayquaza.hp = rayquaza.getMaxHp();
  await rayquaza.loadAssets(false);
  rayquaza.updateInfo?.(true);
  return rayquaza;
}

function installCosmicDevTools(): void {
  const lava = ((globalThis as any).lava ??= {});
  lava.cosmicRay = async () => {
    const scene = globalScene;
    const ray = scene.getPlayerParty().find(pokemon => pokemon.species.speciesId === SpeciesId.RAYQUAZA);
    if (!ray) {
      console.warn("No Rayquaza found in party.");
      return null;
    }

    await transformToCosmicRayquaza(ray);
    await scene.gameData.saveAll(true, false);
    console.log("Cosmic Fear Rayquaza activated.", ray);
    return ray;
  };

  lava.cosmicRayEnemy = async () => {
    const enemyRay = globalScene.getEnemyField().find(pokemon => pokemon.species.speciesId === SpeciesId.RAYQUAZA);
    if (!enemyRay) {
      console.warn("No enemy Rayquaza found on field.");
      return null;
    }
    await transformToCosmicRayquaza(enemyRay);
    console.log("Enemy Cosmic Fear Rayquaza activated.", enemyRay);
    return enemyRay;
  };

  lava.cosmicMoves = () => ({
    nuclearFission: LAVAROGUE_MOVE_IDS.NUCLEAR_FISSION,
    singularity: LAVAROGUE_MOVE_IDS.SINGULARITY,
  });
}

class NuclearFissionAttr extends MoveEffectAttr {
  constructor() {
    super(false, { lastHitOnly: true });
  }

  override apply(user: Pokemon, target: Pokemon, _move: Move): boolean {
    if (!target || target.isFainted()) {
      return false;
    }

    for (const stat of [Stat.DEF, Stat.SPDEF, Stat.ATK, Stat.SPATK]) {
      target.setStatStage(stat, target.getStatStage(stat) - 2);
    }
    target.updateInfo?.(true);

    if (isCosmicRayquaza(user)) {
      const data = getCosmicBattleData(user);
      data.radiationBoosts += 1;
    }

    return true;
  }
}

function addCosmicMoves(): void {
  const nuclearFissionId = addRuntimeMoveId("NUCLEAR_FISSION");
  const singularityId = addRuntimeMoveId("SINGULARITY");

  if ((allMoves as any[]).some(move => move?.id === nuclearFissionId)) {
    return;
  }

  const nuclearFission = new AttackMove(
    nuclearFissionId,
    PokemonType.STELLAR,
    MoveCategory.SPECIAL,
    240,
    100,
    3,
    -1,
    0,
    9,
  )
    .target(MoveTarget.ALL)
    .attr(NuclearFissionAttr);
  nuclearFission.localize();
  nuclearFission.name = NUCLEAR_FISSION_NAME;
  nuclearFission.effect = NUCLEAR_FISSION_EFFECT;

  const singularity = new AttackMove(
    singularityId,
    PokemonType.STELLAR,
    MoveCategory.SPECIAL,
    200,
    100,
    3,
    -1,
    0,
    9,
  ).target(MoveTarget.ALL_ENEMIES);
  singularity.localize();
  singularity.name = SINGULARITY_NAME;
  singularity.effect = SINGULARITY_EFFECT;

  (allMoves as unknown as Array<typeof nuclearFission | typeof singularity>).push(nuclearFission, singularity);
}

function installCosmicMechanics(): void {
  const installKey = "__lavarogueCosmicRayquazaInstalled";
  if ((globalThis as any)[installKey]) {
    return;
  }
  (globalThis as any)[installKey] = true;

  const originalTurnStart = TurnStartPhase.prototype.start;
  TurnStartPhase.prototype.start = function startCosmicRayquazaTurn(): void {
    for (const cfr of getActiveCosmicRayquazas()) {
      applyGravitationalBinding(cfr);
      applyRadiationPressure(cfr);
      applyAccretionDisc(cfr);
    }
    originalTurnStart.call(this);
  };

  const originalPokemonGetEffectiveStat = Pokemon.prototype.getEffectiveStat;
  Pokemon.prototype.getEffectiveStat = function getCosmicEffectiveStat(
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
    let statValue = originalPokemonGetEffectiveStat.call(
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

    if ([Stat.DEF, Stat.SPDEF, Stat.SPATK, Stat.SPD].includes(stat) && !isCosmicRayquaza(this)) {
      statValue *= getRadiationStatMultiplier(this);
    }

    return Math.max(Math.floor(statValue), 1);
  };

  const originalCalculateBattlePower = Move.prototype.calculateBattlePower;
  Move.prototype.calculateBattlePower = function calculateCosmicBattlePower(
    source: Pokemon,
    target: Pokemon,
    simulated = false,
  ): number {
    let power = originalCalculateBattlePower.call(this, source, target, simulated);
    if (power > 0 && isCosmicRayquaza(source)) {
      power = Math.floor(power * LENSING_DAMAGE_MULTIPLIER);
    }
    return power;
  };

  const originalGetAttackTypeEffectiveness = Pokemon.prototype.getAttackTypeEffectiveness;
  Pokemon.prototype.getAttackTypeEffectiveness = function getCosmicAttackTypeEffectiveness(
    moveType: PokemonType,
    params: any = {},
  ) {
    const effectiveness = originalGetAttackTypeEffectiveness.call(this, moveType, params);
    const move = params?.move as Move | undefined;

    if (move?.id === LAVAROGUE_MOVE_IDS.NUCLEAR_FISSION) {
      const getsCosmicWeakness = NUCLEAR_FISSION_SUPER_EFFECTIVE_TYPES.some(type => this.isOfType(type));
      return getsCosmicWeakness ? Math.max(effectiveness, 2) : effectiveness;
    }

    if (move?.id === LAVAROGUE_MOVE_IDS.SINGULARITY) {
      return Math.max(effectiveness, 2);
    }

    return effectiveness;
  };

  const originalDoSetStatus = Pokemon.prototype.doSetStatus;
  Pokemon.prototype.doSetStatus = function doSetStatusCosmicRayquaza(
    effect: StatusEffect,
    sleepTurnsRemaining?: number,
  ): void {
    if (isCosmicRayquaza(this) && effect !== StatusEffect.NONE && effect !== StatusEffect.FAINT) {
      const healAmount = Math.max(Math.ceil(this.getMaxHp() * STATUS_ABSORB_HEAL_PERCENT), 1);
      const healed = this.heal(healAmount);
      this.updateInfo?.(true);
      globalScene.phaseManager.queueMessage(
        `${getPokemonNameWithAffix(this)} absorbed the status with ${COSMIC_DREAD_NAME}!${healed ? ` It restored ${healed} HP!` : ""}`,
      );
      return;
    }

    originalDoSetStatus.call(this, effect, sleepTurnsRemaining);
  };

  const originalApplyConditions = Move.prototype.applyConditions;
  Move.prototype.applyConditions = function applyCosmicRayquazaConditions(
    user: Pokemon,
    target: Pokemon,
    sequence: -1 | 2 | 3 | 4 = 4,
  ): boolean {
    if (sequence === 4) {
      if (tryCosmicDreadFlinch(user)) {
        return false;
      }

      if (target && isCosmicRayquaza(target) && this.hasFlag(MoveFlags.MAKES_CONTACT)) {
        const damage = user.getMaxHp() * CONTACT_TAX_PERCENT;
        applyIndirectDamage(user, damage, target);
        globalScene.phaseManager.queueMessage(
          `${getPokemonNameWithAffix(user)} could not make contact with ${getPokemonNameWithAffix(target)}!`,
        );
        return false;
      }
    }

    return originalApplyConditions.call(this, user, target, sequence);
  };

  const originalGetPpIncreaseFromPressure = MovePhase.prototype.getPpIncreaseFromPressure;
  MovePhase.prototype.getPpIncreaseFromPressure = function getCosmicPpIncreaseFromPressure(targets: Pokemon[]): number {
    let ppIncrease = originalGetPpIncreaseFromPressure.call(this, targets);
    const user = (this as any).pokemon as Pokemon;

    if (!isCosmicRayquaza(user) && getActiveCosmicRayquaza()) {
      ppIncrease += 2;
    }

    return ppIncrease;
  };
}

export function initLavaRogueCosmicRayquaza(): void {
  addCosmicText();
  installCosmicForm();
  addCosmicMoves();
  installCosmicMechanics();
  installCosmicDevTools();
}
