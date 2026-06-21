/*
 * LavaRogue custom item: Star Dust.
 */

import { globalScene } from "#app/global-scene";
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
const STAR_DUST_TEXTURE_KEY = "lavarogue_star_dust_icon";
const STAR_DUST_BOOST_PERCENT = 20;
const STAR_DUST_ULTRA_WEIGHT = 9;
const STAR_DUST_ICON_DATA_URL =
  "data:image/png;base64,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";

let starDustTextureQueued = false;

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

function ensureStarDustTexture(): boolean {
  const textures = (globalScene as any)?.textures;
  if (!textures) {
    return false;
  }

  if (textures.exists(STAR_DUST_TEXTURE_KEY)) {
    return true;
  }

  if (!starDustTextureQueued && typeof textures.addBase64 === "function") {
    starDustTextureQueued = true;
    textures.addBase64(STAR_DUST_TEXTURE_KEY, STAR_DUST_ICON_DATA_URL);
  }

  return textures.exists(STAR_DUST_TEXTURE_KEY);
}

class StarDustModifier extends AttackTypeBoosterModifier {
  constructor(type: any, pokemonId: number, stackCount?: number) {
    super(type, pokemonId, PokemonType.STELLAR, STAR_DUST_BOOST_PERCENT, stackCount);
  }

  override clone(): StarDustModifier {
    return new StarDustModifier(this.type, this.pokemonId, this.stackCount);
  }

  override getArgs(): any[] {
    return [this.pokemonId];
  }

  override matchType(modifier: any): boolean {
    return modifier instanceof StarDustModifier;
  }

  override getIcon(forSummary?: boolean): Phaser.GameObjects.Container {
    const hasCustomTexture = ensureStarDustTexture();
    const container = forSummary ? globalScene.add.container(0, 0).setScale(0.5) : globalScene.add.container(0, 0);

    if (!forSummary) {
      const pokemon = this.getPokemon();
      if (pokemon) {
        const pokemonIcon = globalScene.addPokemonIcon(pokemon, -2, 10, 0, 0.5, undefined, true);
        container.add(pokemonIcon);
        container.setName(pokemon.id.toString());
      }
    }

    const item = hasCustomTexture
      ? globalScene.add.sprite(forSummary ? 0 : 16, forSummary ? 12 : this.virtualStackCount ? 8 : 16, STAR_DUST_TEXTURE_KEY)
      : globalScene.add.sprite(forSummary ? 0 : 16, forSummary ? 12 : this.virtualStackCount ? 8 : 16, "items", STAR_DUST_ICON);
    item.setScale(0.5);
    item.setOrigin(0, 0.5);
    container.add(item);

    const stackText = this.getIconStackText();
    if (stackText) {
      container.add(stackText);
    }

    const virtualStackText = this.getIconStackText(true);
    if (virtualStackText) {
      container.add(virtualStackText);
    }

    return container;
  }
}

function createStarDustModifierType(): PokemonHeldItemModifierType {
  const type = new PokemonHeldItemModifierType(
    "modifierType:ModifierType.STAR_DUST",
    STAR_DUST_ICON,
    (modifierType, args) => {
      const pokemonOrId = args[0] as Pokemon | number;
      const pokemonId = typeof pokemonOrId === "number" ? pokemonOrId : pokemonOrId.id;
      return new StarDustModifier(modifierType, pokemonId);
    },
  );
  type.id = STAR_DUST_ID;
  type.setTier(ModifierTier.ULTRA);
  return type;
}

export function initLavaRogueStarDust(): void {
  addStarDustText();
  ensureStarDustTexture();
  (modifierTypes as any)[STAR_DUST_ID] = createStarDustModifierType;
}

export function initLavaRogueStarDustPool(): void {
  addStarDustText();
  ensureStarDustTexture();

  const alreadyInPool = modifierPool[ModifierTier.ULTRA]?.some(weighted => weighted.modifierType.id === STAR_DUST_ID);

  if (!alreadyInPool) {
    const weightedStarDust = new WeightedModifierType(
      (modifierTypes as any)[STAR_DUST_ID],
      STAR_DUST_ULTRA_WEIGHT,
      STAR_DUST_ULTRA_WEIGHT,
    );
    weightedStarDust.setTier(ModifierTier.ULTRA);
    modifierPool[ModifierTier.ULTRA].push(weightedStarDust);
  }
}
