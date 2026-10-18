// Instant answer checking for "What lives here?", right in the browser (no waiting on Gemini).
// Memory athletes check themselves: you see the real fact and decide. We give a first verdict
// from the key words, and the user can always overrule it with one tap.

const STOP_WORDS = new Set(
  'the a an and or of to in on at by for with from into is are was were be been being it its this that these those which who what when where how than then also can has have had not but as their they them there such each other'.split(' '),
);

// Key words of a sentence: lowercase, no filler words. Each is cut to its first 5 letters (so
// "replicates" and "replication" match) and weighs as much as it is long: "mitochondria" counts
// for more than "main".
function keyWords(text) {
  const words = text.toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?/g) ?? [];
  const weights = new Map();
  for (const w of words) {
    const number = /\d/.test(w);
    if (!number && (w.length < 3 || STOP_WORDS.has(w))) continue;
    weights.set(w.slice(0, 5), Math.max(weights.get(w.slice(0, 5)) ?? 0, number ? 8 : w.length));
  }
  return weights;
}

// keyTerms (from Gemini when the palace was filled, e.g. ["anaphase", "sister chromatids"]) are the
// words a right answer must contain. A term counts if any of its words shows up in the answer.
const hasTerm = (term, given) => [...keyWords(term).keys()].some((w) => given.has(w));
function keyTermShare(keyTerms, given) {
  return keyTerms.filter((term) => hasTerm(term, given)).length / keyTerms.length;
}

// → 'right' | 'close' (let the user decide) | 'wrong'
export function checkAnswer(fact, answer, keyTerms) {
  const wanted = keyWords(fact);
  const given = keyWords(answer);
  if (!wanted.size || !given.size) return 'wrong';
  const numbersOk = [...wanted.keys()].filter((w) => /\d/.test(w)).every((w) => given.has(w));
  if (keyTerms?.length) {
    const share = keyTermShare(keyTerms, given);
    // The first key term is what the fact is about (Zeus, the nucleus): leaving it out is only close.
    if (share >= 0.66 && numbersOk && hasTerm(keyTerms[0], given)) return 'right';
    if (share > 0) return 'close';
  }
  let total = 0;
  let hit = 0;
  for (const [word, weight] of wanted) {
    total += weight;
    if (given.has(word)) hit += weight;
  }
  // Numbers in the fact have to be there ("22 pairs" isn't "23 pairs"): checked above.
  const share = hit / total;
  if (share >= 0.45 && numbersOk) return 'right';
  if (share >= 0.15) return 'close';
  return 'wrong';
}
