/*
 * LavaRogue custom item: Star Dust.
 */

import { modifierTypes } from "#data/data-lists";
import { PokemonType } from "#enums/pokemon-type";
import type { Pokemon } from "#field/pokemon";
import { AttackTypeBoosterModifier } from "#modifiers/modifier";
import { PokemonHeldItemModifierType } from "#modifiers/modifier-type";
import i18next from "i18next";

const STAR_DUST_ID = "STAR_DUST";
const STAR_DUST_NAME = "Star Dust";
const STAR_DUST_ICON = "stellar_tera_shard";
const STAR_DUST_BOOST_PERCENT = 20;

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

export function initLavaRogueStarDust(): void {
  const installKey = "__lavarogueStarDustInstalled";
  if ((globalThis as any)[installKey]) {
    addStarDustText();
    return;
  }
  (globalThis as any)[installKey] = true;

  addStarDustText();

  (modifierTypes as any)[STAR_DUST_ID] = () => {
    const type = new PokemonHeldItemModifierType(
      "modifierType:ModifierType.STAR_DUST",
      STAR_DUST_ICON,
      (modifierType, args) =>
        new AttackTypeBoosterModifier(modifierType, (args[0] as Pokemon).id, PokemonType.STELLAR, STAR_DUST_BOOST_PERCENT),
    );
    type.id = STAR_DUST_ID;
    return type;
  };
}
