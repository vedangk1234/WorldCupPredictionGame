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
  stage?: 'group' | 'ro32' | 'ro16' | 'qf' | 'sf' | 'third'; // default 'group'
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

  // b) pred 1–1 → 2–1 ET, actual 1–1 FT & 2–1 ET → FT GD+1, exact FT+5, ET winner+3, exact ET+5, ET GD+1 = 15,
  //    PLUS the new "name the winner" +3 (FT-draw pred named A via the decisive ET; A won the tie) = 18.
  { num: 23, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [2, 1],
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 3, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 18, correctScorers: 0 } },

  // c) pred 1–1 → 2–2 → pens Arg(1), actual 1–1 / 2–2 / Arg → FT GD+1, exact FT+5, ET GD+1, exact ET+5, pens+5 = 17,
  //    PLUS the new "name the winner" +3 (FT-draw pred named A via the pen pick; A won on pens) = 20.
  { num: 24, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 2], etActual: [2, 2], predPen: 1, penWinner: 1,
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 0, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 5, superstarPts: 0, totalPts: 20, correctScorers: 0 } },

  // d) pred 1–1 → 1–1 → pens Arg(1), actual 1–1 / 1–1 / Arg → FT+5+1, ET+5+1, pens+5 = 17 (no ET scorers),
  //    PLUS the new "name the winner" +3 (FT-draw pred named A via the pen pick; A won on pens) = 20.
  { num: 25, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [1, 1], etActual: [1, 1], predPen: 1, penWinner: 1,
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 0, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 5, superstarPts: 0, totalPts: 20, correctScorers: 0 } },

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
  // Player 700 (non-superstar). To exercise the ET scorer track, ET must have been
  // ACTUALLY PLAYED — so the actual FT is a genuine DRAW (0–0) and the ET totals are
  // populated (an FT-draw prediction + a drawn FT is the only realistic way in). FT
  // pred draw 1–1 vs actual 0–0 → FT exact 0, FT GD +1 (0==0, UNAVOIDABLE baseline),
  // FT winner 0. Predicted a DECISIVE ET 2–1 but actual ET 0–1 (wrong ET winner ⇒ ET
  // winner/GD/exact all 0, named side A ≠ actual winner B ⇒ knockout winner +3 not
  // awarded) — this isolates the scorer points on top of the FT-GD +1 baseline.
  // j) picked in BOTH, scores 1 FT goal + 1 ET goal → +2 (FT) +2 (ET), + FT GD 1 = 5.
  { num: 32, stage: 'ro32', pred: [1, 1], actual: [0, 0], goals: [n(700)], picks: [700], underdog: null,
    predEt: [2, 1], etActual: [0, 1], etGoals: [n(700)], etPicks: [700],
    expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 2, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 2, penPts: 0, superstarPts: 0, totalPts: 5, correctScorers: 1 } },

  // k) picked in BOTH, scores ONLY 1 FT goal → FT pick pays +2, ET pick pays 0, + FT GD 1 = 3 (NOT 5).
  { num: 33, stage: 'ro32', pred: [1, 1], actual: [0, 0], goals: [n(700)], picks: [700], underdog: null,
    predEt: [2, 1], etActual: [0, 1], etGoals: [], etPicks: [700],
    expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 2, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 1 } },

  // l) picked in FT ONLY, scores only in ET → FT pick doesn't pay for an ET goal → 0, + FT GD 1 = 1.
  { num: 34, stage: 'ro32', pred: [1, 1], actual: [0, 0], goals: [], picks: [700], underdog: null,
    predEt: [2, 1], etActual: [0, 1], etGoals: [n(700)], etPicks: [],
    expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 1, correctScorers: 0 } },

  // m) picked in ET ONLY, scores only in ET → ET pick pays +2, + FT GD 1 = 3.
  { num: 35, stage: 'ro32', pred: [1, 1], actual: [0, 0], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [0, 1], etGoals: [n(700)], etPicks: [700],
    expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 2, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 0 } },

  // ===================== Knockout (ro16) — IDENTICAL rules to ro32 =====================
  // These duplicate ro32 cases (b, c, f1) with stage='ro16' to prove the RO16 stage
  // scores the same knockout way (ET / penalties / contingent bonuses / superstar).
  // n) (mirrors 23) pred 1–1 → 2–1 ET, actual 1–1 FT & 2–1 ET → 15 + new "name the winner" +3 (named A, A won) = 18.
  { num: 36, stage: 'ro16', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [2, 1],
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 3, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 18, correctScorers: 0 } },

  // o) (mirrors 24) pred 1–1 → 2–2 → pens Arg(1), actual 1–1 / 2–2 / Arg → 17 + new "name the winner" +3 (named A, A won on pens) = 20.
  { num: 37, stage: 'ro16', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 2], etActual: [2, 2], predPen: 1, penWinner: 1,
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 0, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 5, superstarPts: 0, totalPts: 20, correctScorers: 0 } },

  // p) (mirrors 27) superstar (player 35) picked as FT scorer, scores ONLY in ET → +3 (scored anywhere).
  //    pred FT 2–1 decisive (no ET portion), actual FT 1–1 / ET 2–1 (A wins).
  //    UPDATED for the new knockout winner rule (same as case 27, on ro16): decisive-FT pred
  //    (side A) vs drawn FT ultimately won by A → FT winner +3 (was 0); superstar +3. total 6.
  { num: 38, stage: 'ro16', pred: [2, 1], actual: [1, 1], goals: [], picks: [35], underdog: null,
    superstars: [35], predEt: [0, 0], etActual: [2, 1], etGoals: [n(35)],
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 3, totalPts: 6, correctScorers: 0 } },

  // ===================== Knockout (qf) — IDENTICAL rules to ro32 / ro16 =====================
  // q) (mirrors 23 / 36) pred 1–1 → 2–1 ET, actual 1–1 FT & 2–1 ET → 15 + new "name the winner" +3 (named A, A won) = 18.
  { num: 39, stage: 'qf', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [2, 1],
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 3, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 18, correctScorers: 0 } },

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
  // x) (mirrors 23 / 36 / 39) pred 1–1 → 2–1 ET, actual 1–1 FT & 2–1 ET → 15 + new "name the winner" +3 (named A, A won) = 18.
  { num: 46, stage: 'sf', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [2, 1],
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 3, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 18, correctScorers: 0 } },

  // y) NEW decisive-FT-winner rule on sf (mirrors 40): pred 2–0 (side A), FT 1–1, ET 2–1
  //    (A wins in ET) → FT winner +3, everything else 0. Proves the rule fires on 'sf'.
  { num: 47, stage: 'sf', pred: [2, 0], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [0, 0], etActual: [2, 1],
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 0 } },

  // =========== SECOND knockout winner rule: FT-DRAW predictions "name the winner" ===========
  // Generalises the +3 to FT-draw predictors: the named side (ET winner if a decisive ET was
  // predicted, else the penalty pick) winning the tie earns the +3 — INDEPENDENTLY of whether
  // the final-outcome contingency zeroes their exact bonuses.
  //
  // z) hk_goat / mm_2605 case: pred 1–1 / 1–1 (level ET) / pens to B(2); actual FT 1–1, ET 1–2
  //    (B wins IN ET — no shoot-out). Named B via the pen pick, B won the tie → winner +3. BUT the
  //    final outcome is WRONG (they predicted pens; the tie ended in ET), so the contingency ZEROES
  //    FT exact / ET exact / ET winner / pen. Kept: FT GD (0==0 → +1); ET GD is 0 (pred margin 0 ≠
  //    actual −1). The +3 and the zeroed exacts COEXIST. total = 3 + 1 = 4.
  { num: 48, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [1, 1], etActual: [1, 2], predPen: 2, penWinner: null,
    expect: { winnerPts: 3, gdPts: 1, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 4, correctScorers: 0 } },

  // aa) Fully-correct pens: pred 1–1 / 1–1 (level ET) / pens to A(1); actual FT 1–1, ET 1–1, pens A.
  //     Named A via the pen pick, A won → winner +3; final outcome CORRECT → all exacts KEPT
  //     (FT exact+5, FT GD+1, ET exact+5, ET GD+1, pen+5). total = 3 + 5 + 1 + 5 + 1 + 5 = 20.
  { num: 49, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [1, 1], etActual: [1, 1], predPen: 1, penWinner: 1,
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 0, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 5, superstarPts: 0, totalPts: 20, correctScorers: 0 } },

  // bb) Decisive-ET pred names the winner (not double-counted): pred 1–1 → 1–2 (B wins in ET);
  //     actual FT 1–1, ET 1–2 (B wins). Named B, B won → winner +3 (awarded ONCE). Separately the
  //     ET winner +3 bucket also lands (correct ET winner), plus FT exact+5, FT GD+1, ET exact+5,
  //     ET GD+1. winnerPts is exactly 3 (NOT 6). total = 3 + 5 + 1 + 3 + 5 + 1 = 18.
  { num: 50, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [1, 2], etActual: [1, 2],
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 3, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 18, correctScorers: 0 } },

  // cc) Named the LOSER: pred 1–1 → 1–2 (B wins in ET); actual FT 1–1, ET 1–1 → pens won by A(1).
  //     Named B via the decisive ET, but A won the tie → winner 0. Final outcome wrong → exacts
  //     zeroed. Kept: FT GD (0==0 → +1). ET GD is 0 (pred margin −1 ≠ actual 0). total = 1.
  { num: 51, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [1, 2], etActual: [1, 1], predPen: null, penWinner: 1,
    expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 1, correctScorers: 0 } },

  // dd) Named NOBODY: pred 1–1 / 1–1 (level ET) but NO pen pick; actual FT 1–1, ET 1–1 → pens A(1).
  //     namedWinnerSide → null (level ET + no pen pick) → winner 0. Final outcome wrong (no pen pick)
  //     → exacts zeroed. Kept: FT GD (+1), ET GD (0==0 → +1). total = 2.
  { num: 52, stage: 'ro32', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [1, 1], etActual: [1, 1], predPen: null, penWinner: 1,
    expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 1, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 2, correctScorers: 0 } },

  // =========== THIRD knockout winner rule: "won by ANY route" incl. a decisive 90' ===========
  // The +3 now fires when the NAMED side wins by ANY route, including a match decided in
  // regulation (no ET, no pens). actualWinnerSide() falls through to the FT score. NO etActual
  // is passed on these "won in 90'" cases because ET was NOT played — and the ET-track gate now
  // requires ET to have been ACTUALLY played (FT level AND et_score populated), so NONE of the
  // ET components (ET exact / ET GD / ET winner / ET scorers) or penalties can score on a match
  // decided in 90 minutes. (Previously a level-ET FT-draw prediction wrongly earned ET GD +1 by
  // matching a defaulted 0–0 actual ET; that leak is now fixed.) The winner +3 is unaffected —
  // it lives outside the ET block.
  //
  // ee) mm_2605 case: FT-DRAW pred 1–1, named B via the PEN pick (level ET 1–1 → pens B);
  //     actual FT 0–2 — B won by TWO in 90' (no ET, no pens). Named B, B won the match →
  //     winner +3 (was 0 under the shipped rule, which paid nothing for a 90' result). FT GD 0
  //     (margin 0 ≠ −2). ET GD is now 0 (ET was not played — no ET-track scoring). total = 3.
  { num: 53, stage: 'ro32', pred: [1, 1], actual: [0, 2], goals: [], picks: [], underdog: null,
    predEt: [1, 1], predPen: 2,
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 0 } },

  // ff) FT-DRAW pred 1–1, named A via a DECISIVE-ET pick (predEt 2–1); actual FT 0–2 — the
  //     OTHER team (B) won in 90'. Named A, A did NOT win → winner 0. Decisive-ET pred ⇒ no
  //     ET GD (pred margin 1 ≠ actual 0). total = 0.
  { num: 54, stage: 'ro32', pred: [1, 1], actual: [0, 2], goals: [], picks: [], underdog: null,
    predEt: [2, 1],
    expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },

  // gg) FT-DRAW pred 1–1, LEVEL ET (1–1) but NO pen pick; actual FT 0–2 won in 90'.
  //     namedWinnerSide → null (level ET + no pen pick) → winner 0. ET was NOT played, so ET GD
  //     no longer leaks → 0. total = 0.
  { num: 55, stage: 'ro32', pred: [1, 1], actual: [0, 2], goals: [], picks: [], underdog: null,
    predEt: [1, 1],
    expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },

  // hh) DECISIVE-FT pred 2–0 won cleanly in 90' (actual 3–1, no ET/pen data at all). The plain
  //     FT winner line awards +3; the knockout block re-affirms it (named A === actual A) WITHOUT
  //     doubling — winnerPts is a flat 3, not 6. FT GD +1 (margin 2 == 2). total = 3 + 1 = 4.
  { num: 56, stage: 'ro32', pred: [2, 0], actual: [3, 1], goals: [], picks: [], underdog: null,
    expect: { winnerPts: 3, gdPts: 1, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 4, correctScorers: 0 } },

  // =========== ET-track gate: no ET points when extra time was NOT actually played ===========
  // A match decided in 90 minutes (et_score null) must score ZERO across EVERY ET component and
  // penalties, for ANY prediction, regardless of what ET was predicted. Before the fix these
  // level-ET FT-draw predictions leaked ET GD +1 by matching a defaulted 0–0 actual ET.
  //
  // ii) FT-draw pred 0–0, LEVEL ET 0–0 (named nobody); actual FT 1–0 — A won in 90' (no ET).
  //     ET was not played → ET GD 0 (was +1). namedWinnerSide → null → winner 0. total = 0.
  { num: 57, stage: 'ro32', pred: [0, 0], actual: [1, 0], goals: [], picks: [], underdog: null,
    predEt: [0, 0],
    expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 0, correctScorers: 0 } },

  // jj) FT-draw pred 1–1, level ET 1–1, predicted pens to A(1); actual FT 2–1 — A won in 90'
  //     (no ET/pens). ET not played → ET GD, exact ET, pen all 0. Named A via the pen pick and
  //     A won the match → winner +3 (unaffected by the ET gate). total = 3.
  { num: 58, stage: 'ro32', pred: [1, 1], actual: [2, 1], goals: [], picks: [], underdog: null,
    predEt: [1, 1], predPen: 1,
    expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, etWinnerPts: 0, etGdPts: 0, etExactPts: 0, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 3, correctScorers: 0 } },

  // kk) Sanity: ET-track STILL scores normally when ET WAS played. FT-draw pred 1–1 → level ET
  //     1–1 → pens A(1); actual FT 1–1, ET 1–1 (played), pens A. Full award kept (mirrors 49).
  { num: 59, stage: 'ro16', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [1, 1], etActual: [1, 1], predPen: 1, penWinner: 1,
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 0, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 5, superstarPts: 0, totalPts: 20, correctScorers: 0 } },

  // ===================== Knockout (third) — IDENTICAL rules to ro32 / ro16 / qf / sf =====================
  // (mirrors 46) pred 1–1 → 2–1 ET, actual 1–1 FT & 2–1 ET → 15 + "name the winner" +3 (named A, A won) = 18.
  // Proves the knockout scoring fires identically on the Third-place match ('third').
  { num: 60, stage: 'third', pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null,
    predEt: [2, 1], etActual: [2, 1],
    expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, etWinnerPts: 3, etGdPts: 1, etExactPts: 5, etScorerPts: 0, penPts: 0, superstarPts: 0, totalPts: 18, correctScorers: 0 } },
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
