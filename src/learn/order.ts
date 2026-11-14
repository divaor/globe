// "Put them in order": rounds of four things from the stories (a building, an invention, a painting, a dish...)
// to place in time, oldest first. Early rounds mix things far apart in time; later ones bring them closer.

/** Years before today on a log scale: 1900 and 1950 are as far apart as 1000 BC and 500 AD. */
const age = (t: number) => Math.log10(Math.max(5, 2027 - t));

/**
 * `n` rounds of `size` things, none used twice, shown in an order that is not already right. Things in a round are
 * at least 10 years apart, and apart on the log scale by a gap that falls from 0.8 (a factor of six in age) to 0.25
 * (a factor of 1.8) over the game. `key` tells two things apart (the same thing can be in two collections).
 */
export function orderRounds<T extends { t: number }>(pool: T[], n: number, size: number, rand: () => number, key: (x: T) => string): T[][] {
  const shuffle = <U,>(a: U[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const used = new Set<string>();
  const rounds: T[][] = [];
  for (let k = 0; k < n; k++) {
    let gap = 0.8 - (0.55 * k) / Math.max(1, n - 1);
    let round: T[] = [];
    for (let tries = 0; tries < 60 && round.length < size; tries++) {
      round = [];
      for (const x of shuffle(pool.slice())) {
        if (used.has(key(x)) || round.some((y) => key(y) === key(x))) continue;
        if (round.every((y) => Math.abs(y.t - x.t) >= 10 && Math.abs(age(y.t) - age(x.t)) >= gap)) round.push(x);
        if (round.length === size) break;
      }
      // Too few things that far apart: ask for a little less.
      if (round.length < size) gap *= 0.85;
    }
    if (round.length < size) break;
    for (const x of round) used.add(key(x));
    // Never shown already in order (that would be a free point).
    const right = round.slice().sort((a, b) => a.t - b.t).map(key).join('|');
    do shuffle(round); while (round.map(key).join('|') === right);
    rounds.push(round);
  }
  return rounds;
}
