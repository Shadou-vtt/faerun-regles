/**
 * L'épopée de Faerûn – Règles maison
 *
 * 1. Ingénieux (humain, PHB 2024) : le personnage gagne l'Inspiration héroïque
 *    à la fin de chaque Repos long. dnd5e n'automatise pas ce trait.
 *    Le hook s'exécute sur le client qui effectue le repos (joueur ou MJ) :
 *    la mise à jour est intégrée à celle du repos, sans requête supplémentaire.
 *
 * 2. Sauvagerie martiale / Attaquant sauvage (don d'origine, PHB 2024) :
 *    une fois par tour, quand le personnage touche avec une arme, il lance
 *    deux fois les dés de dégâts de l'arme et garde le meilleur résultat.
 *    Automatisé sur les jets de dégâts des activités d'attaque d'une arme :
 *    les dés de l'arme sont remplacés par un pool {dés, dés}kh (les bonus
 *    fixes et les dés de coup critique déjà appliqués sont conservés).
 *    Règle maison de la table : s'applique à toutes les attaques d'arme
 *    (SAVAGE_ONCE_PER_TURN = false). Avec true, limité au premier jet de
 *    dégâts d'arme du personnage à chaque tour de combat.
 */
const RESOURCEFUL = "resourceful";
const SAVAGE_IDENTIFIERS = new Set(["savage-attacker", "sauvagerie-martiale", "attaquant-sauvage"]);
const SAVAGE_NAME = /sauvagerie martiale|attaquant sauvage|savage attacker/i;
const SAVAGE_ONCE_PER_TURN = false; // règle du livre : true ; règle maison de la table : false

/* ---------------------------------------- */
/*  Ingénieux                                */
/* ---------------------------------------- */

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

/* ---------------------------------------- */
/*  Sauvagerie martiale                      */
/* ---------------------------------------- */

/** Dernier tour de combat où le don a été utilisé, par acteur. */
const savageLastUse = new Map();

function hasSavageAttacker(actor) {
  return actor?.items.some(i => (i.type === "feat")
    && (SAVAGE_IDENTIFIERS.has(i.system?.identifier) || SAVAGE_NAME.test(i.name))) ?? false;
}

/**
 * Remplace les dés d'une DamageRoll par un pool "lancer deux fois, garder le meilleur".
 * @param {DamageRoll} roll  Jet construit (critique déjà appliqué), non évalué.
 * @returns {DamageRoll|null}  Nouveau jet, ou null si le jet ne contient aucun dé.
 */
function savageRoll(roll) {
  const { DiceTerm, OperatorTerm } = foundry.dice.terms;
  const dice = [];
  const rest = [];
  let pendingOp = null;
  for (const term of roll.terms) {
    if (term instanceof OperatorTerm) { pendingOp = term.operator; continue; }
    const target = (term instanceof DiceTerm) ? dice : rest;
    target.push({ op: pendingOp ?? "+", formula: term.formula });
    pendingOp = null;
  }
  if (!dice.length) return null;
  const diceFormula = dice.map((p, i) => (i === 0 && p.op === "+") ? p.formula : `${p.op} ${p.formula}`).join(" ");
  const restFormula = rest.map(p => `${p.op} ${p.formula}`).join(" ");
  const formula = `{${diceFormula}, ${diceFormula}}kh ${restFormula}`.trim();
  const options = foundry.utils.mergeObject(roll.options, { configured: true, preprocessed: true }, { inplace: false });
  return new CONFIG.Dice.DamageRoll(formula, roll.data, options);
}

Hooks.on("dnd5e.postDamageRollConfiguration", (rolls, config, dialog, message) => {
  const activity = config.subject;
  const item = activity?.item;
  const actor = activity?.actor;
  if (!actor || !item || item.type !== "weapon" || activity.type !== "attack") return;
  if (!rolls?.length || !hasSavageAttacker(actor)) return;

  // Règle maison (Bruno, 22/11/2026) : s'applique à TOUTES les attaques d'arme,
  // pas seulement une fois par tour. Pour revenir à la règle du livre, passer
  // SAVAGE_ONCE_PER_TURN à true.
  if (SAVAGE_ONCE_PER_TURN) {
    const combat = game.combat;
    if (combat?.started) {
      const key = `${combat.id}:${combat.round}:${combat.turn}`;
      if (savageLastUse.get(actor.id) === key) return;
      savageLastUse.set(actor.id, key);
    }
  }

  const replaced = savageRoll(rolls[0]);
  if (!replaced) return;
  rolls[0] = replaced;
  if (message?.data) {
    message.data.flavor = `${message.data.flavor ?? ""} — Sauvagerie martiale (dés lancés deux fois, meilleur résultat)`.trim();
  }
});
