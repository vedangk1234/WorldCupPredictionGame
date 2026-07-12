// Self-verifying test suite for the scoring engine.
// Run with: npm run test:scoring
// Exits 1 if any case fails.

import { scorePrediction, ScoringInput, ScoringResult } from '@/lib/scoring';

type Goal = { playerId: number; isOwnGoal: boolean };
const n = (playerId: number): Goal => ({ playerId, isOwnGoal: false });
const og = (playerId: number): Goal => ({ playerId, isOwnGoal: true });

interface Expect {
  winnerPts?: number;
  gdPts?: number;
  exactPts?: number;
  scorerPts?: number;
  underdogPts?: number;
  superstarPts?: number;
  etWinnerPts?: number;
  etGdPts?: number;
  etExactPts?: number;
  etScorerPts?: number;
  penPts?: number;
  totalPts: number;
  correctScorers?: number;
}

interface Case {
  num: number;
  stage?: 'group' | 'ro32' | 'ro16' | 'qf' | 'sf'; // default 'group'
  pred: [number, number];
  actual: [number, number];
  goals: Goal[];
  picks: number[];
  underdog: number | null;
  isRound3?: boolean; // default false
  superstars?: number[]; // default []
  // ro32-only fields
  predEt?: [number, number];
  etActual?: [number, number];
  penWinner?: number | null; // actual pen winner team id
  predPen?: number | null; // predicted pen winner team id
  etGoals?: Goal[];
  etPicks?: number[];
  expect: Expect;
}

// teamAId = 1, teamBId = 2 throughout.
const cases: Case[] = [
  // ===================== Group stage (regression) =====================
  { num: 1, pred: [2, 1], actual: [2, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, underdogPts: 0, superstarPts: 0, totalPts: 9, correctScorers: 0 } },
  { num: 2, pred: [3, 2], actual: [2, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 3, gdPts: 1, exactPts: 0, scorerPts: 0, underdogPts: 0, superstarPts: 0, totalPts: 4, correctScorers: 0 } },
  { num: 3, pred: [3, 1], actual: [2, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, underdogPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 0 } },
  { num: 4, pred: [1, 2], actual: [2, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, underdogPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },
  { num: 5, pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 0, gdPts: 1, exactPts: 5, scorerPts: 0, underdogPts: 0, superstarPts: 0, totalPts: 6, correctScorers: 0 } },
  { num: 6, pred: [1, 1], actual: [2, 2], goals: [], picks: [], underdog: null, expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 0, underdogPts: 0, superstarPts: 0, totalPts: 1, correctScorers: 0 } },
  { num: 7, pred: [2, 1], actual: [1, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, underdogPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },
  { num: 8, pred: [2, 1], actual: [2, 1], goals: [n(101), n(101), n(201)], picks: [101], underdog: null, expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 4, underdogPts: 0, superstarPts: 0, totalPts: 13, correctScorers: 1 } },
  { num: 9, pred: [9, 0], actual: [1, 1], goals: [n(301), n(401)], picks: [301], underdog: null, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 2, underdogPts: 0, superstarPts: 0, totalPts: 2, correctScorers: 1 } },
  { num: 10, pred: [0, 0], actual: [1, 0], goals: [og(401)], picks: [401], underdog: null, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: -1, underdogPts: 0, superstarPts: 0, totalPts: -1, correctScorers: 0 } },
  { num: 11, pred: [9, 0], actual: [1, 1], goals: [n(501), og(501)], picks: [501], underdog: null, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 1, underdogPts: 0, superstarPts: 0, totalPts: 1, correctScorers: 1 } },
  { num: 12, pred: [1, 2], actual: [1, 2], goals: [], picks: [], underdog: 2, expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, underdogPts: 5, superstarPts: 0, totalPts: 14, correctScorers: 0 } },
  { num: 13, pred: [1, 2], actual: [1, 1], goals: [], picks: [], underdog: 2, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, underdogPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },
  { num: 14, pred: [2, 1], actual: [1, 2], goals: [], picks: [], underdog: 2, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, underdogPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },
  { num: 15, pred: [1, 2], actual: [1, 2], goals: [], picks: [], underdog: null, expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, underdogPts: 0, superstarPts: 0, totalPts: 9, correctScorers: 0 } },
  { num: 16, pred: [0, 1], actual: [1, 2], goals: [], picks: [], underdog: 2, expect: { winnerPts: 3, gdPts: 1, exactPts: 0, scorerPts: 0, underdogPts: 5, superstarPts: 0, totalPts: 9, correctScorers: 0 } },

  // --- Superstar bonus (group-stage round-3 only). Player 35 = a flagged superstar. ---
  { num: 17, pred: [2, 1], actual: [2, 1], goals: [n(35), n(35), n(201)], picks: [35], underdog: null, isRound3: true, superstars: [35], expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 4, underdogPts: 0, superstarPts: 3, totalPts: 16, correctScorers: 1 } },
  { num: 18, pred: [2, 1], actual: [2, 1], goals: [n(201), n(902), n(903)], picks: [35, 201], underdog: null, isRound3: true, superstars: [35], expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 2, underdogPts: 0, superstarPts: -3, totalPts: 8, correctScorers: 1 } },
  { num: 19, pred: [0, 0], actual: [1, 0], goals: [og(35)], picks: [35], underdog: null, isRound3: true, superstars: [35], expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: -1, underdogPts: 0, superstarPts: -3, totalPts: -4, correctScorers: 0 } },
  { num: 20, pred: [2, 1], actual: [2, 1], goals: [n(35), n(201), n(900)], picks: [201], underdog: null, isRound3: true, superstars: [35], expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 2, underdogPts: 0, superstarPts: 0, totalPts: 11, correctScorers: 1 } },
  { num: 21, pred: [2, 1], actual: [2, 1], goals: [n(35), n(35), n(900)], picks: [35], underdog: null, isRound3: false, superstars: [35], expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 4, underdogPts: 0, superstarPts: 0, totalPts: 13, correctScorers: 1 } },

  // ===================== Knockout (ro32) =====================
  // a) Decisive FT 2–1 vs actual 2–1 → +3 +5 +1, no ET (pred wasn't an FT draw).
  { num: 22, stage: 'ro32', pred: [2, 1], actual: [2, 1], goals: [], picks: [], underdog: null,
    predEt: [0, 0], etActual: [0, 0],
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 9, correctScorers: 0 } },

  // b) pred 1–1 → 2–1 ET, actual 1–1 FT & 2–1 ET → FT GD+1, exact FT+5, ET winner+3, exact ET+5, ET GD+1 = 15.
  { num: 23, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [2, 1],
    expect: { winnerPts: 0, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 3, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 15, correctScorers: 0 } },

  // c) pred 1–1 → 2–2 → pens Arg(1), actual 1–1 / 2–2 / Arg → FT GD+1, exact FT+5, ET GD+1, exact ET+5, pens+5 = 17.
  { num: 24, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 2], etActual: [2, 2], predPen: 1, penWinner: 1,
    expect: { winnerPts: 0, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 0, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 5, superstarPts: 0, totalPts: 17, correctScorers: 0 } },

  // d) pred 1–1 → 1–1 → pens Arg(1), actual 1–1 / 1–1 / Arg → FT+5+1, ET+5+1, pens+5 = 17 (no ET scorers).
  { num: 25, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [1, 1], etActual: [1, 1], predPen: 1, penWinner: 1,
    expect: { winnerPts: 0, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 0, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 5, superstarPts: 0, totalPts: 17, correctScorers: 0 } },

  // e) ET winner WRONG (pred 1–1 → 2–1 ET, actual 1–1 / 1–2 ET). Wrong final outcome → FT exact, ET exact,
  //    ET winner all FORFEITED (0). Keeps FT GD+1 (FT draw matches) + ET scorer (player 700 real ET goal → +2)
  //    = 3. (ET GD already 0 — margins differ.)
  { num: 26, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [1, 2], etGoals: [n(700)], etPicks: [700],
    expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 2, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 0 } },

  // f1) Superstar (player 35) picked as FT scorer, scores ONLY in ET → +3 (scored anywhere).
  //     pred FT 2–1 decisive (no ET portion), actual FT 1–1 / ET 2–1 (A wins).
  //     UPDATED for the new knockout winner rule: this is a DECISIVE-FT prediction (side A)
  //     against a DRAWN FT that was ultimately decided in A's favour (ET 2–1), so the FT
  //     winner +3 is now awarded (was 0 under the old rule). FT gd/exact still 0; superstar +3.
  //     total 3 + 3 = 6.
  { num: 27, stage: 'ro32', pred: [2, 1], actual: [1, 1], goals: [], picks: [35], underdog: null,
    superstars: [35], predEt: [0, 0], etActual: [2, 1], etGoals: [n(35)],
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 3, totalPts: 6, correctScorers: 0 } },

  // f2) Superstar (player 35) picked as FT scorer, NEVER scores anywhere → −3.
  //     UPDATED for the new knockout winner rule: decisive-FT pred (side A) vs drawn FT
  //     ultimately won by A (ET 2–1) → FT winner +3 (was 0). Superstar −3. total 3 − 3 = 0.
  { num: 28, stage: 'ro32', pred: [2, 1], actual: [1, 1], goals: [], picks: [35], underdog: null,
    superstars: [35], predEt: [0, 0], etActual: [2, 1], etGoals: [n(900)],
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: -3, totalPts: 0, correctScorers: 0 } },

  // g) Group-stage match with et/pen fields present but must be IGNORED → identical to today.
  { num: 29, stage: 'group', pred: [2, 1], actual: [2, 1], goals: [], picks: [], underdog: null,
    predEt: [5, 0], etActual: [5, 0], predPen: 1, penWinner: 1,
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 9, correctScorers: 0 } },

  // h) WRONG penalty winner. pred FT 1–1 → ET 1–1 (level) → pens TeamA(1); actual FT 1–1 / ET 1–1 / pens TeamB(2).
  //    Wrong final outcome → FT exact AND ET exact both FORFEITED (0), plus the pen +5 lost. Keeps FT GD+1,
  //    ET GD+1 (0==0), and the correctly-picked FT scorer (player 800 real FT goal → +2). total = 1+1+2 = 4.
  { num: 30, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [n(800), n(801)], picks: [800], underdog: null,
    predEt: [1, 1], etActual: [1, 1], predPen: 1, penWinner: 2,
    expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 2, etWinnerPts: 0, etGdPts: 1, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 4, correctScorers: 1 } },

  // i) EXACT FT predicted but WRONG ET winner → exacts zeroed, only GD(s) + scorers kept.
  //    pred FT 2–2 (== actual FT 2–2, so FT exact WOULD be +5) → decisive ET [4,3] (A wins by 1);
  //    actual ET [3,4] (B wins by 1) → wrong ET winner. (A decisive-ET prediction can never have a
  //    matching exact ET with the wrong winner, so etExact is naturally 0; the point is FT exact is
  //    FORFEITED.) Keeps FT GD+1 (draw matches) + FT scorer (player 800 real FT goal → +2). ET GD is 0
  //    (margins +1 vs −1 differ). total = 1+2 = 3.
  { num: 31, stage: 'ro32', pred: [2, 2], actual: [2, 2], goals: [n(800)], picks: [800], underdog: null,
    predEt: [4, 3], etActual: [3, 4], etGoals: [], etPicks: [],
    expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 2, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 1 } },

  // --- Same player in BOTH FT and ET scorer lists: scoring is PHASE-STRICT. ---
  // Player 700 (non-superstar). FT pred draw 1–1 → actual FT 1–0 (decisive, so FT
  // winner/gd/exact all 0). Predicted decisive ET 2–1 but actual ET 1–2 (wrong ET
  // winner ⇒ all ET winner/gd/exact zeroed) — this isolates the scorer points.
  // j) picked in BOTH, scores 1 FT goal + 1 ET goal → +2 (FT) +2 (ET) = +4.
  { num: 32, stage: 'ro32', pred: [1, 1], actual: [1, 0], goals: [n(700)], picks: [700], underdog: null,
    predEt: [2, 1], etActual: [1, 2], etGoals: [n(700)], etPicks: [700],
    expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 2, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 2, penPts: 0, superstarPts: 0, totalPts: 4, correctScorers: 1 } },

  // k) picked in BOTH, scores ONLY 1 FT goal → FT pick pays +2, ET pick pays 0 → +2 (NOT +4).
  { num: 33, stage: 'ro32', pred: [1, 1], actual: [1, 0], goals: [n(700)], picks: [700], underdog: null,
    predEt: [2, 1], etActual: [1, 2], etGoals: [], etPicks: [700],
    expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 2, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 2, correctScorers: 1 } },

  // l) picked in FT ONLY, scores only in ET → FT pick doesn't pay for an ET goal → 0.
  { num: 34, stage: 'ro32', pred: [1, 1], actual: [1, 0], goals: [], picks: [700], underdog: null,
    predEt: [2, 1], etActual: [1, 2], etGoals: [n(700)], etPicks: [],
    expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },

  // m) picked in ET ONLY, scores only in ET → ET pick pays +2.
  { num: 35, stage: 'ro32', pred: [1, 1], actual: [1, 0], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [1, 2], etGoals: [n(700)], etPicks: [700],
    expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 2, penPts: 0, superstarPts: 0, totalPts: 2, correctScorers: 0 } },

  // ===================== Knockout (ro16) — IDENTICAL rules to ro32 =====================
  // These duplicate ro32 cases (b, c, f1) with stage='ro16' to prove the RO16 stage
  // scores the same knockout way (ET / penalties / contingent bonuses / superstar).
  // n) (mirrors 23) pred 1–1 → 2–1 ET, actual 1–1 FT & 2–1 ET → FT GD+1, exact FT+5, ET winner+3, exact ET+5, ET GD+1 = 15.
  { num: 36, stage: 'ro16', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [2, 1],
    expect: { winnerPts: 0, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 3, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 15, correctScorers: 0 } },

  // o) (mirrors 24) pred 1–1 → 2–2 → pens Arg(1), actual 1–1 / 2–2 / Arg → FT GD+1, exact FT+5, ET GD+1, exact ET+5, pens+5 = 17.
  { num: 37, stage: 'ro16', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 2], etActual: [2, 2], predPen: 1, penWinner: 1,
    expect: { winnerPts: 0, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 0, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 5, superstarPts: 0, totalPts: 17, correctScorers: 0 } },

  // p) (mirrors 27) superstar (player 35) picked as FT scorer, scores ONLY in ET → +3 (scored anywhere).
  //    pred FT 2–1 decisive (no ET portion), actual FT 1–1 / ET 2–1 (A wins).
  //    UPDATED for the new knockout winner rule (same as case 27, on ro16): decisive-FT pred
  //    (side A) vs drawn FT ultimately won by A → FT winner +3 (was 0); superstar +3. total 6.
  { num: 38, stage: 'ro16', pred: [2, 1], actual: [1, 1], goals: [], picks: [35], underdog: null,
    superstars: [35], predEt: [0, 0], etActual: [2, 1], etGoals: [n(35)],
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 3, totalPts: 6, correctScorers: 0 } },

  // ===================== Knockout (qf) — IDENTICAL rules to ro32 / ro16 =====================
  // q) (mirrors 23 / 36) pred 1–1 → 2–1 ET, actual 1–1 FT & 2–1 ET → FT GD+1, exact FT+5, ET winner+3, exact ET+5, ET GD+1 = 15.
  { num: 39, stage: 'qf', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [2, 1],
    expect: { winnerPts: 0, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 3, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 15, correctScorers: 0 } },

  // ===================== NEW knockout winner rule (decisive-FT pred, drawn FT, tie decided) =====================
  // A DECISIVE-FT predictor earns the FT winner +3 when the FT was a DRAW but the tie was
  // ultimately decided (ET decisive, or level ET → pens) in favour of the side they backed at FT.
  // They never enter the ET track (that needs a predicted FT draw), so this +3 is their ONLY gain:
  // exact FT and FT GD stay 0 (2–0 ≠ 1–1 and margin 2 ≠ 0), and all ET/pen buckets stay 0.
  // r) pred 2–0 (side A), FT 1–1, ET 2–1 (A wins in ET) → winner +3. gotWinner true.
  { num: 40, stage: 'ro32', pred: [2, 0], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [0, 0], etActual: [2, 1],
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 0 } },

  // s) pred 2–0 (side A), FT 1–1, ET 1–2 (B wins in ET) → wrong ultimate winner → winner 0.
  { num: 41, stage: 'ro32', pred: [2, 0], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [0, 0], etActual: [1, 2],
    expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },

  // t) pred 2–0 (side A), FT 1–1, ET 1–1 → pens won by team A(1) → A decided the tie → winner +3.
  //    (Decisive-FT pred → no ET track, so the +5 pen bonus is NOT awarded; only the winner +3.)
  { num: 42, stage: 'ro32', pred: [2, 0], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [0, 0], etActual: [1, 1], penWinner: 1,
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 0 } },

  // u) pred 2–0 (side A), FT 1–1, ET 1–1 → pens won by team B(2) → wrong ultimate winner → winner 0.
  { num: 43, stage: 'ro32', pred: [2, 0], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [0, 0], etActual: [1, 1], penWinner: 2,
    expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },

  // v) GROUP stage: pred 2–0, actual 1–1 (draw). New rule is gated behind isKnockout → does NOT
  //    fire; a drawn group match awards no winner point. Stays winner 0.
  { num: 44, stage: 'group', pred: [2, 0], actual: [1, 1], goals: [], picks: [], underdog: null,
    expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },

  // w) Predicted side B path (predMargin < 0) + ro16 scope: pred 0–2 (side B), FT 1–1,
  //    ET 1–2 (B wins) → winner +3.
  { num: 45, stage: 'ro16', pred: [0, 2], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [0, 0], etActual: [1, 2],
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 0 } },

  // ===================== Knockout (sf) — IDENTICAL rules to ro32 / ro16 / qf =====================
  // x) (mirrors 23 / 36 / 39) pred 1–1 → 2–1 ET, actual 1–1 FT & 2–1 ET → FT GD+1, exact FT+5, ET winner+3, exact ET+5, ET GD+1 = 15.
  { num: 46, stage: 'sf', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [2, 1],
    expect: { winnerPts: 0, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 3, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 15, correctScorers: 0 } },

  // y) NEW decisive-FT-winner rule on sf (mirrors 40): pred 2–0 (side A), FT 1–1, ET 2–1
  //    (A wins in ET) → FT winner +3, everything else 0. Proves the rule fires on 'sf'.
  { num: 47, stage: 'sf', pred: [2, 0], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [0, 0], etActual: [2, 1],
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 0 } },
];

let failures = 0;

const CHECK_KEYS: (keyof Expect)[] = [
  'winnerPts',
  'gdPts',
  'exactPts',
  'scorerPts',
  'underdogPts',
  'superstarPts',
  'etWinnerPts',
  'etGdPts',
  'etExactPts',
  'etScorerPts',
  'penPts',
  'totalPts',
  'correctScorers',
];

for (const c of cases) {
  const input: ScoringInput = {
    stage: c.stage ?? 'group',
    predScoreA: c.pred[0],
    predScoreB: c.pred[1],
    predictedScorerIds: c.picks,
    actualScoreA: c.actual[0],
    actualScoreB: c.actual[1],
    actualGoals: c.goals,
    teamAId: 1,
    teamBId: 2,
    underdogTeamId: c.underdog,
    isRound3: c.isRound3 ?? false,
    superstarPlayerIds: c.superstars ?? [],
    etScoreA: c.etActual?.[0],
    etScoreB: c.etActual?.[1],
    penWinnerTeamId: c.penWinner ?? null,
    predEtA: c.predEt?.[0],
    predEtB: c.predEt?.[1],
    predPenWinnerTeamId: c.predPen ?? null,
    predictedScorerIdsEt: c.etPicks ?? [],
    actualGoalsEt: c.etGoals ?? [],
  };

  const got = scorePrediction(input);

  const diffs: string[] = [];
  for (const key of CHECK_KEYS) {
    const expected = c.expect[key] ?? 0;
    const actual = (got as unknown as Record<string, number>)[key];
    if (actual !== expected) {
      diffs.push(`${key}: expected ${expected}, got ${actual}`);
    }
  }

  // Boolean flags must be consistent with their point values.
  const flagChecks: [keyof ScoringResult, boolean][] = [
    ['gotWinner', got.winnerPts > 0],
    ['gotGd', got.gdPts > 0],
    ['gotExact', got.exactPts > 0],
    ['gotUnderdog', got.underdogPts > 0],
  ];
  for (const [flag, expected] of flagChecks) {
    if (got[flag] !== expected) {
      diffs.push(`${flag}: expected ${expected}, got ${got[flag]}`);
    }
  }

  if (diffs.length === 0) {
    console.log(`PASS  case ${c.num}`);
  } else {
    failures++;
    console.log(`FAIL  case ${c.num}  — ${diffs.join('; ')}`);
  }
}

console.log('');
if (failures === 0) {
  console.log(`All ${cases.length} cases passed.`);
} else {
  console.log(`${failures} of ${cases.length} cases FAILED.`);
  process.exit(1);
}
