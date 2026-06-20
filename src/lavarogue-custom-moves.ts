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

export const LAVAROGUE_MOVE_IDS = {
  DRACO_DANCE: 10_000,
} as const;

function addRuntimeMoveId(name: keyof typeof LAVAROGUE_MOVE_IDS): MoveId {
  const id = LAVAROGUE_MOVE_IDS[name];
  const moveIdMap = MoveId as unknown as Record<string | number, string | number>;

  moveIdMap[name] = id;
  moveIdMap[id] = name;

  return id as MoveId;
}

export function initLavaRogueCustomMoves(): void {
  const dracoDanceId = addRuntimeMoveId("DRACO_DANCE");

  const dracoDance = new SelfStatusMove(dracoDanceId, PokemonType.DRAGON, -1, 20, -1, 0, 9)
    .attr(StatStageChangeAttr, [Stat.SPATK, Stat.SPD], 1, true)
    .danceMove();

  dracoDance.name = "Draco Dance";
  dracoDance.effect = "The user performs a mystical draconic dance, boosting its Sp. Atk and Speed stats.";

  (allMoves as unknown as Record<number, typeof dracoDance>)[dracoDanceId] = dracoDance;

  // Rayquaza already has Nasty Plot as egg move #2. Replace it with Draco Dance so unlocked Rayquaza gets it immediately.
  speciesEggMoves[SpeciesId.RAYQUAZA] = [
    MoveId.V_CREATE,
    dracoDanceId,
    MoveId.CORE_ENFORCER,
    MoveId.DRAGON_DARTS,
  ];
}
