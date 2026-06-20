/*
 * LavaRogue custom moves.
 *
 * Keeps custom fork-only moves isolated from generated upstream data files.
 */

import { speciesEggMoves } from "#balance/moves/egg-moves";
import { allMoves } from "#data/data-lists";
import { MoveId } from "#enums/move-id";
import { PokemonType } from "#enums/pokemon-type";
import { SpeciesId } from "#enums/species-id";
import { Stat } from "#enums/stat";
import { SelfStatusMove, StatStageChangeAttr } from "#moves/move";
import i18next from "i18next";

export const LAVAROGUE_MOVE_IDS: Record<string, MoveId> = {};

function addRuntimeMoveId(name: string): MoveId {
  const id = (allMoves as unknown as unknown[]).length as MoveId;
  const moveIdMap = MoveId as unknown as Record<string | number, string | number>;

  moveIdMap[name] = id;
  moveIdMap[id] = name;
  LAVAROGUE_MOVE_IDS[name] = id;

  return id;
}

function addCustomMoveText(): void {
  const languages = new Set(["en", i18next.language].filter(Boolean));

  for (const language of languages) {
    i18next.addResource(language, "move", "dracoDance.name", "Draco Dance");
    i18next.addResource(
      language,
      "move",
      "dracoDance.effect",
      "The user performs a mystical draconic dance, boosting its Sp. Atk and Speed stats.",
    );
  }
}

export function initLavaRogueCustomMoves(): void {
  addCustomMoveText();

  const dracoDanceId = addRuntimeMoveId("DRACO_DANCE");

  const dracoDance = new SelfStatusMove(dracoDanceId, PokemonType.DRAGON, -1, 20, -1, 0, 9)
    .attr(StatStageChangeAttr, [Stat.SPATK, Stat.SPD], 1, true)
    .danceMove();

  dracoDance.localize();

  (allMoves as unknown as Array<typeof dracoDance>).push(dracoDance);

  // Rayquaza already has Nasty Plot as egg move #2. Replace it with Draco Dance so unlocked Rayquaza gets it immediately.
  (speciesEggMoves as any)[SpeciesId.RAYQUAZA] = [
    MoveId.V_CREATE,
    dracoDanceId,
    MoveId.CORE_ENFORCER,
    MoveId.DRAGON_DARTS,
  ];
}
