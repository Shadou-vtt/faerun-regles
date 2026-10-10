/**
 * L'épopée de Faerûn – Règles maison
 * Ingénieux (humain, PHB 2024) : le personnage gagne l'Inspiration héroïque
 * à la fin de chaque Repos long. dnd5e n'automatise pas ce trait.
 * Le hook s'exécute sur le client qui effectue le repos (joueur ou MJ) :
 * la mise à jour est intégrée à celle du repos, sans requête supplémentaire.
 */
const RESOURCEFUL = "resourceful";

Hooks.on("dnd5e.preRestCompleted", (actor, result, config) => {
  if (result?.type !== "long") return;
  const hasTrait = actor.items.some(i => i.system?.identifier === RESOURCEFUL);
  if (!hasTrait) return;
  result.updateData ??= {};
  result.updateData["system.attributes.inspiration"] = true;
});

Hooks.on("dnd5e.restCompleted", (actor, result) => {
  if (result?.type !== "long") return;
  if (!actor.isOwner || !actor.items.some(i => i.system?.identifier === RESOURCEFUL)) return;
  ui.notifications?.info(`${actor.name} gagne l'Inspiration héroïque (Ingénieux).`);
});
