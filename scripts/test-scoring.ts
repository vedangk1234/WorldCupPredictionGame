// Self-verifying test suite for the scoring engine.
// Run with: npm run test:scoring
// Exits 1 if any case fails.

import { scorePrediction, ScoringInput, ScoringResult } from '@/lib/scoring';

type Goal = { playerId: number; isOwnGoal: boolean };
const n = (playerId: number): Goal => ({ playerId, isOwnGoal: false });
const og = (playerId: number): Goal => ({ playerId, isOwnGoal: true });

interface Case {
  num: number;
  pred: [number, number];
  actual: [number, number];
  goals: Goal[];
  picks: number[];
  underdog: number | null;
  expect: {
    winnerPts: number;
    gdPts: number;
    exactPts: number;
    scorerPts: number;
    underdogPts: number;
    totalPts: number;
    correctScorers: number;
  };
}

const cases: Case[] = [
  { num: 1, pred: [2, 1], actual: [2, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, underdogPts: 0, totalPts: 9, correctScorers: 0 } },
  { num: 2, pred: [3, 2], actual: [2, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 3, gdPts: 1, exactPts: 0, scorerPts: 0, underdogPts: 0, totalPts: 4, correctScorers: 0 } },
  { num: 3, pred: [3, 1], actual: [2, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 3, gdPts: 0, exactPts: 0, scorerPts: 0, underdogPts: 0, totalPts: 3, correctScorers: 0 } },
  { num: 4, pred: [1, 2], actual: [2, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, underdogPts: 0, totalPts: 0, correctScorers: 0 } },
  { num: 5, pred: [1, 1], actual: [1, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 0, gdPts: 1, exactPts: 5, scorerPts: 0, underdogPts: 0, totalPts: 6, correctScorers: 0 } },
  { num: 6, pred: [1, 1], actual: [2, 2], goals: [], picks: [], underdog: null, expect: { winnerPts: 0, gdPts: 1, exactPts: 0, scorerPts: 0, underdogPts: 0, totalPts: 1, correctScorers: 0 } },
  { num: 7, pred: [2, 1], actual: [1, 1], goals: [], picks: [], underdog: null, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, underdogPts: 0, totalPts: 0, correctScorers: 0 } },
  { num: 8, pred: [2, 1], actual: [2, 1], goals: [n(101), n(101), n(201)], picks: [101], underdog: null, expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 4, underdogPts: 0, totalPts: 13, correctScorers: 1 } },
  { num: 9, pred: [9, 0], actual: [1, 1], goals: [n(301), n(401)], picks: [301], underdog: null, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 2, underdogPts: 0, totalPts: 2, correctScorers: 1 } },
  { num: 10, pred: [0, 0], actual: [1, 0], goals: [og(401)], picks: [401], underdog: null, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: -1, underdogPts: 0, totalPts: -1, correctScorers: 0 } },
  { num: 11, pred: [9, 0], actual: [1, 1], goals: [n(501), og(501)], picks: [501], underdog: null, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 1, underdogPts: 0, totalPts: 1, correctScorers: 1 } },
  { num: 12, pred: [1, 2], actual: [1, 2], goals: [], picks: [], underdog: 2, expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, underdogPts: 5, totalPts: 14, correctScorers: 0 } },
  { num: 13, pred: [1, 2], actual: [1, 1], goals: [], picks: [], underdog: 2, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, underdogPts: 0, totalPts: 0, correctScorers: 0 } },
  { num: 14, pred: [2, 1], actual: [1, 2], goals: [], picks: [], underdog: 2, expect: { winnerPts: 0, gdPts: 0, exactPts: 0, scorerPts: 0, underdogPts: 0, totalPts: 0, correctScorers: 0 } },
  { num: 15, pred: [1, 2], actual: [1, 2], goals: [], picks: [], underdog: null, expect: { winnerPts: 3, gdPts: 1, exactPts: 5, scorerPts: 0, underdogPts: 0, totalPts: 9, correctScorers: 0 } },
  { num: 16, pred: [0, 1], actual: [1, 2], goals: [], picks: [], underdog: 2, expect: { winnerPts: 3, gdPts: 1, exactPts: 0, scorerPts: 0, underdogPts: 5, totalPts: 9, correctScorers: 0 } },
];

let failures = 0;

for (const c of cases) {
  const input: ScoringInput = {
    predScoreA: c.pred[0],
    predScoreB: c.pred[1],
    predictedScorerIds: c.picks,
    actualScoreA: c.actual[0],
    actualScoreB: c.actual[1],
    actualGoals: c.goals,
    teamAId: 1,
    teamBId: 2,
    underdogTeamId: c.underdog,
  };

  const got = scorePrediction(input);

  const checks: (keyof Case['expect'])[] = [
    'winnerPts',
    'gdPts',
    'exactPts',
    'scorerPts',
    'underdogPts',
    'totalPts',
    'correctScorers',
  ];

  const diffs: string[] = [];
  for (const key of checks) {
    const expected = c.expect[key];
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
