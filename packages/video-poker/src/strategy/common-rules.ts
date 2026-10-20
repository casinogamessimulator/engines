import { HandClass } from '../evaluate.ts';
import {
  ACE,
  ALL,
  distinctRanks,
  fourToStraight,
  highCount,
  INDEX_SETS,
  isHigh,
  isOutsideStraightDraw,
  JACK,
  KING,
  maskOf,
  ofAKind,
  QUEEN,
  straightFit,
  suited,
  TEN,
  threeToStraightFlush,
  withRanks,
} from './hand.ts';
import { defineRules } from './types.ts';

/** Rules shared by every game's charts. Game files add their own (e.g. kicker rules) next to their charts. */
export const COMMON_RULES = defineRules({
  'pat-royal-straight-flush-quads': {
    text: {
      en: 'Royal flush, straight flush or four of a kind',
      es: 'Escalera real, escalera de color o póker',
      'pt-br': 'Royal flush, straight flush ou quadra',
    },
    example: 'Ah Kh Qh Jh Th',
    match: (h) => {
      if (h.handClass === HandClass.RoyalFlush || h.handClass === HandClass.StraightFlush) return ALL;
      const quads = ofAKind(h, 4);
      return quads.length ? maskOf(quads) : null;
    },
  },
  'four-to-royal': {
    text: {
      en: '4 to a royal flush',
      es: '4 cartas de escalera real',
      'pt-br': '4 cartas para royal flush',
    },
    example: 'Ks Qs Js Ts',
    match: (h) => {
      for (const indexes of INDEX_SETS[4]) {
        if (suited(h, indexes) && indexes.every((i) => h.ranks[i] >= TEN)) return maskOf(indexes);
      }
      return null;
    },
  },
  'pat-full-house-flush-straight-trips': {
    text: {
      en: 'Full house, flush, straight or three of a kind',
      es: 'Full, color, escalera o trío',
      'pt-br': 'Full house, flush, sequência ou trinca',
    },
    example: '7c 7d 7h',
    match: (h) => {
      if (h.handClass === HandClass.FullHouse || h.handClass === HandClass.Flush || h.handClass === HandClass.Straight) return ALL;
      return h.handClass === HandClass.ThreeOfAKind ? maskOf(ofAKind(h, 3)) : null;
    },
  },
  'four-to-straight-flush': {
    text: {
      en: '4 to a straight flush',
      es: '4 cartas de escalera de color',
      'pt-br': '4 cartas para straight flush',
    },
    example: '5h 6h 7h 8h',
    match: (h) => {
      for (const indexes of INDEX_SETS[4]) {
        if (suited(h, indexes) && distinctRanks(h, indexes) && straightFit(indexes.map((i) => h.ranks[i]))) {
          return maskOf(indexes);
        }
      }
      return null;
    },
  },
  'two-pair': {
    text: {
      en: 'Two pair',
      es: 'Doble pareja',
      'pt-br': 'Dois pares',
    },
    example: '9c 9d 4h 4s',
    match: (h) => (h.handClass === HandClass.TwoPair ? maskOf(ofAKind(h, 2)) : null),
  },
  'high-pair': {
    text: {
      en: 'High pair (jacks or better)',
      es: 'Pareja alta (jotas o mejor)',
      'pt-br': 'Par alto (valetes ou melhor)',
    },
    example: 'Js Jh',
    match: (h) => (h.handClass === HandClass.HighPair ? maskOf(ofAKind(h, 2)) : null),
  },
  'three-to-royal': {
    text: {
      en: '3 to a royal flush',
      es: '3 cartas de escalera real',
      'pt-br': '3 cartas para royal flush',
    },
    example: 'Kh Qh Jh',
    match: (h) => {
      for (const indexes of INDEX_SETS[3]) {
        if (suited(h, indexes) && indexes.every((i) => h.ranks[i] >= TEN) && distinctRanks(h, indexes)) return maskOf(indexes);
      }
      return null;
    },
  },
  'four-to-flush': {
    text: {
      en: '4 to a flush',
      es: '4 cartas de color',
      'pt-br': '4 cartas para flush',
    },
    example: '2d 6d 9d Kd',
    match: (h) => {
      for (const indexes of INDEX_SETS[4]) if (suited(h, indexes)) return maskOf(indexes);
      return null;
    },
  },
  'unsuited-tjqk': {
    text: {
      en: '10-J-Q-K, mixed suits',
      es: '10-J-Q-K de distintos palos',
      'pt-br': '10-J-Q-K de naipes diferentes',
    },
    example: 'Tc Jd Qh Ks',
    match: (h) => withRanks(h, [TEN, JACK, QUEEN, KING], false),
  },
  'low-pair': {
    text: {
      en: 'Low pair (2s through 10s)',
      es: 'Pareja baja (de 2 a 10)',
      'pt-br': 'Par baixo (de 2 a 10)',
    },
    example: '5s 5h',
    match: (h) => (h.handClass === HandClass.LowPair ? maskOf(ofAKind(h, 2)) : null),
  },
  'four-to-outside-straight': {
    text: {
      en: '4 to an open-ended straight',
      es: '4 cartas de escalera abierta',
      'pt-br': '4 cartas para sequência aberta',
    },
    example: '5h 6d 7c 8h',
    match: (h) => fourToStraight(h, (ranks) => isOutsideStraightDraw(ranks)),
  },
  // 3 to a straight flush, by how many high cards make up for the gaps: A has at least as many high
  // cards as gaps (and needs no deuce or low ace), B is one short or needs a deuce or low ace, C is two short.
  'three-to-straight-flush-a': {
    text: {
      en: '3 to a straight flush with at least as many high cards as gaps',
      es: '3 cartas de escalera de color con tantas cartas altas como huecos, o más',
      'pt-br': '3 cartas para straight flush com tantas cartas altas quanto lacunas, ou mais',
    },
    example: '8s 9s Js',
    match: (h) => threeToStraightFlush(h, (fit, high) => fit.fitsAboveDeuce && high >= fit.gaps),
  },
  'suited-qj': {
    text: {
      en: 'Suited Q-J',
      es: 'Q-J del mismo palo',
      'pt-br': 'Q-J do mesmo naipe',
    },
    example: 'Qd Jd',
    match: (h) => withRanks(h, [QUEEN, JACK], true),
  },
  'four-to-inside-straight-4-high': {
    text: {
      en: 'A-K-Q-J, mixed suits',
      es: 'A-K-Q-J de distintos palos',
      'pt-br': 'A-K-Q-J de naipes diferentes',
    },
    example: 'Ac Kd Qh Js',
    match: (h) => withRanks(h, [ACE, KING, QUEEN, JACK], false),
  },
  'suited-kq-kj': {
    text: {
      en: 'Suited K-Q or K-J',
      es: 'K-Q o K-J del mismo palo',
      'pt-br': 'K-Q ou K-J do mesmo naipe',
    },
    example: 'Kc Qc',
    match: (h) => withRanks(h, [KING, QUEEN], true) ?? withRanks(h, [KING, JACK], true),
  },
  'suited-ak-aq-aj': {
    text: {
      en: 'Suited A-K, A-Q or A-J',
      es: 'A-K, A-Q o A-J del mismo palo',
      'pt-br': 'A-K, A-Q ou A-J do mesmo naipe',
    },
    example: 'Ah Qh',
    match: (h) =>
      withRanks(h, [ACE, KING], true) ?? withRanks(h, [ACE, QUEEN], true) ?? withRanks(h, [ACE, JACK], true),
  },
  'four-to-inside-straight-3-high': {
    text: {
      en: '4 to an inside straight with 3 high cards',
      es: '4 cartas de escalera interna con 3 cartas altas',
      'pt-br': '4 cartas para sequência interna com 3 cartas altas',
    },
    example: 'Kc Qd Jh 9s',
    match: (h) =>
      fourToStraight(h, (ranks, high) => !isOutsideStraightDraw(ranks) && high === 3),
  },
  'three-to-straight-flush-b': {
    text: {
      en: '3 to a straight flush, one high card short of the gaps (or using a 2 or a low ace)',
      es: '3 cartas de escalera de color con una carta alta menos que huecos (o con 2 o as bajo)',
      'pt-br': '3 cartas para straight flush com uma carta alta a menos que lacunas (ou com 2 ou ás baixo)',
    },
    example: '5c 7c 8c',
    match: (h) =>
      threeToStraightFlush(h, (fit, high) => fit.gaps - high === 1 || (!fit.fitsAboveDeuce && fit.gaps - high <= 0)),
  },
  'unsuited-jqk': {
    text: {
      en: 'J-Q-K, mixed suits',
      es: 'J-Q-K de distintos palos',
      'pt-br': 'J-Q-K de naipes diferentes',
    },
    example: 'Jc Qd Kh',
    match: (h) => withRanks(h, [JACK, QUEEN, KING], false),
  },
  'unsuited-jq': {
    text: {
      en: 'J-Q, mixed suits',
      es: 'J-Q de distintos palos',
      'pt-br': 'J-Q de naipes diferentes',
    },
    example: 'Js Qh',
    match: (h) => withRanks(h, [JACK, QUEEN], false),
  },
  'suited-tj': {
    text: {
      en: 'Suited 10-J',
      es: '10-J del mismo palo',
      'pt-br': '10-J do mesmo naipe',
    },
    example: 'Th Jh',
    match: (h) => withRanks(h, [TEN, JACK], true),
  },
  // Two unsuited high cards. With three or more, the ace goes: the two lowest make more straights.
  'unsuited-kq-kj': {
    text: {
      en: 'K-Q or K-J, mixed suits',
      es: 'K-Q o K-J de distintos palos',
      'pt-br': 'K-Q ou K-J de naipes diferentes',
    },
    example: 'Kd Jc',
    match: (h) => {
      const highs = [0, 1, 2, 3, 4].filter((i) => isHigh(h.ranks[i]) && h.ranks[i] !== ACE);
      return highs.length >= 2 ? maskOf(highs.sort((a, b) => h.ranks[a] - h.ranks[b]).slice(0, 2)) : null;
    },
  },
  'unsuited-ak-aq-aj': {
    text: {
      en: 'A-K, A-Q or A-J, mixed suits',
      es: 'A-K, A-Q o A-J de distintos palos',
      'pt-br': 'A-K, A-Q ou A-J de naipes diferentes',
    },
    example: 'Ac Kh',
    match: (h) => {
      const highs = [0, 1, 2, 3, 4].filter((i) => isHigh(h.ranks[i]));
      return highs.length === 2 && highs.some((i) => h.ranks[i] === ACE) ? maskOf(highs) : null;
    },
  },
  'suited-tq': {
    text: {
      en: 'Suited 10-Q',
      es: '10-Q del mismo palo',
      'pt-br': '10-Q do mesmo naipe',
    },
    example: 'Ts Qs',
    match: (h) => withRanks(h, [TEN, QUEEN], true),
  },
  'one-j-q-k': {
    text: {
      en: 'A single J, Q or K',
      es: 'Una sola J, Q o K',
      'pt-br': 'Um único J, Q ou K',
    },
    example: 'Qc',
    match: (h) => {
      const index = [0, 1, 2, 3, 4].find((i) => h.ranks[i] >= JACK && h.ranks[i] <= KING);
      return index === undefined ? null : 1 << index;
    },
  },
  'suited-tk': {
    text: {
      en: 'Suited 10-K',
      es: '10-K del mismo palo',
      'pt-br': '10-K do mesmo naipe',
    },
    example: 'Td Kd',
    match: (h) => withRanks(h, [TEN, KING], true),
  },
  'one-ace': {
    text: {
      en: 'A single ace',
      es: 'Un solo as',
      'pt-br': 'Um único ás',
    },
    example: 'Ad',
    match: (h) => {
      const index = h.ranks.indexOf(ACE);
      return index < 0 ? null : 1 << index;
    },
  },
  'three-to-straight-flush-c': {
    text: {
      en: '3 to a straight flush, two high cards short of the gaps',
      es: '3 cartas de escalera de color con dos cartas altas menos que huecos',
      'pt-br': '3 cartas para straight flush com duas cartas altas a menos que lacunas',
    },
    example: '3h 5h 7h',
    match: (h) => threeToStraightFlush(h, () => true),
  },
  'discard-all': {
    text: {
      en: 'Nothing: draw five new cards',
      es: 'Nada: cambia las cinco cartas',
      'pt-br': 'Nada: troque as cinco cartas',
    },
    example: '',
    match: () => 0,
  },

  // Broader rules for the Easy charts: fewer lines to remember, at a small cost.
  'two-suited-high': {
    text: {
      en: '2 suited high cards',
      es: '2 cartas altas del mismo palo',
      'pt-br': '2 cartas altas do mesmo naipe',
    },
    example: 'Kc Qc',
    match: (h) => {
      for (const indexes of INDEX_SETS[2]) {
        if (suited(h, indexes) && highCount(h, indexes) === 2) return maskOf(indexes);
      }
      return null;
    },
  },
  'three-to-straight-flush': {
    text: {
      en: '3 to a straight flush',
      es: '3 cartas de escalera de color',
      'pt-br': '3 cartas para straight flush',
    },
    example: '5c 7c 8c',
    match: (h) => threeToStraightFlush(h, () => true),
  },
  // With three or more high cards, the two lowest: they make more straights.
  'two-high-cards': {
    text: {
      en: '2 high cards (with 3 or more, the two lowest)',
      es: '2 cartas altas (con 3 o más, las dos más bajas)',
      'pt-br': '2 cartas altas (com 3 ou mais, as duas mais baixas)',
    },
    example: 'Kd Jc',
    match: (h) => {
      const highs = [0, 1, 2, 3, 4].filter((i) => isHigh(h.ranks[i]));
      return highs.length >= 2 ? maskOf(highs.sort((a, b) => h.ranks[a] - h.ranks[b]).slice(0, 2)) : null;
    },
  },
  'suited-ten-high': {
    text: {
      en: 'Suited 10 with a J, Q or K',
      es: '10 con J, Q o K del mismo palo',
      'pt-br': '10 com J, Q ou K do mesmo naipe',
    },
    example: 'Th Jh',
    match: (h) =>
      withRanks(h, [TEN, JACK], true) ?? withRanks(h, [TEN, QUEEN], true) ?? withRanks(h, [TEN, KING], true),
  },
  'one-high-card': {
    text: {
      en: 'One high card',
      es: 'Una carta alta',
      'pt-br': 'Uma carta alta',
    },
    example: 'Qc',
    match: (h) => {
      const index = [0, 1, 2, 3, 4].find((i) => isHigh(h.ranks[i]));
      return index === undefined ? null : 1 << index;
    },
  },
});
