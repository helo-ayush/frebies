/**
 * Every player on the page, so only one sounds at a time and Space reaches the
 * one last used.
 */
export type Deck = { toggle: () => void; pause: () => void };

const decks: Deck[] = [];
let front: Deck | null = null;

/** Pause every other player and make this the one Space controls. */
export function bringToFront(deck: Deck) {
  decks.forEach((other) => {
    if (other !== deck) other.pause();
  });
  front = deck;
}

function onGlobalKey(event: KeyboardEvent) {
  if (event.key !== " " || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  // Only when nothing else on the page wants the key.
  if (target && target !== document.body && target !== document.documentElement) return;
  const deck = front ?? decks[0];
  if (!deck || document.querySelector("dialog[open]")) return;
  event.preventDefault();
  deck.toggle();
}

export function registerDeck(deck: Deck) {
  decks.push(deck);
  if (decks.length === 1) window.addEventListener("keydown", onGlobalKey);
  return () => {
    const at = decks.indexOf(deck);
    if (at >= 0) decks.splice(at, 1);
    if (front === deck) front = null;
    if (decks.length === 0) window.removeEventListener("keydown", onGlobalKey);
  };
}
