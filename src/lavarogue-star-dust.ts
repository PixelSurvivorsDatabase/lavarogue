/*
 * LavaRogue custom item: Star Dust.
 */

import { modifierTypes } from "#data/data-lists";
import { ModifierTier } from "#enums/modifier-tier";
import { PokemonType } from "#enums/pokemon-type";
import type { Pokemon } from "#field/pokemon";
import { AttackTypeBoosterModifier } from "#modifiers/modifier";
import { modifierPool } from "#modifiers/modifier-pools";
import { PokemonHeldItemModifierType, WeightedModifierType } from "#modifiers/modifier-type";
import i18next from "i18next";

const STAR_DUST_ID = "STAR_DUST";
const STAR_DUST_NAME = "Star Dust";
const STAR_DUST_ICON = "stellar_tera_shard";
const STAR_DUST_BOOST_PERCENT = 20;
const STAR_DUST_ULTRA_WEIGHT = 9;

function addStarDustText(): void {
  const languages = new Set(["en", "en-US", i18next.language].filter(Boolean));

  for (const language of languages) {
    i18next.addResource(language, "modifierType", "ModifierType.STAR_DUST.name", STAR_DUST_NAME);
    i18next.addResource(
      language,
      "modifierType",
      "ModifierType.STAR_DUST.description",
      `Increases the power of the holder's Stellar-type moves by ${STAR_DUST_BOOST_PERCENT}%. Stacks up to 99 times.`,
    );
  }
}

function createStarDustModifierType(): PokemonHeldItemModifierType {
  const type = new PokemonHeldItemModifierType(
    "modifierType:ModifierType.STAR_DUST",
    STAR_DUST_ICON,
    (modifierType, args) =>
      new AttackTypeBoosterModifier(modifierType, (args[0] as Pokemon).id, PokemonType.STELLAR, STAR_DUST_BOOST_PERCENT),
  );
  type.id = STAR_DUST_ID;
  type.setTier(ModifierTier.ULTRA);
  return type;
}

export function initLavaRogueStarDust(): void {
  addStarDustText();
  (modifierTypes as any)[STAR_DUST_ID] = createStarDustModifierType;
}

export function initLavaRogueStarDustPool(): void {
  addStarDustText();

  const starDustType = createStarDustModifierType();
  const alreadyInPool = modifierPool[ModifierTier.ULTRA]?.some(weighted => weighted.modifierType.id === STAR_DUST_ID);

  if (!alreadyInPool) {
    const weightedStarDust = new WeightedModifierType(starDustType, STAR_DUST_ULTRA_WEIGHT, STAR_DUST_ULTRA_WEIGHT);
    weightedStarDust.setTier(ModifierTier.ULTRA);
    modifierPool[ModifierTier.ULTRA].push(weightedStarDust);
  }
}
