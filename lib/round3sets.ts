// Round-3 "4 of 6 per set" bonus sets (CLAUDE.md §2.9).
//
// There are 4 fixed sets of 6 round-3 match ids each. The grouping is HARDCODED
// by MATCH ID (never derived from date/timezone) so it is identical for every
// user regardless of their display timezone. For each set, a user who gets the
// CORRECT OUTCOME on >= 4 of the set's 6 matches WINS that set for +5. The four
// sets are independent (no carry-forward); a user can win 0–4 sets (0 to +20).
//
// This file is the single source of truth for the set membership; it is used by
// recomputeSetBonus() in app/admin/actions.ts.

export const SET_1: number[] = [9, 11, 13, 14, 2, 5];
export const SET_2: number[] = [28, 30, 33, 35, 20, 24];
export const SET_3: number[] = [49, 50, 46, 47, 37, 40];
export const SET_4: number[] = [69, 71, 64, 66, 57, 59];

// The 4 sets, in order. Each set = 6 round-3 match ids.
export const ROUND3_SETS: number[][] = [SET_1, SET_2, SET_3, SET_4];

// Minimum correct outcomes within a set to win it (+5).
export const SET_WIN_THRESHOLD = 4;

// Points awarded per set won.
export const SET_BONUS_POINTS = 5;

// All 24 match ids across the 4 sets (used to scope the predictions query).
export const ALL_SET_MATCH_IDS: number[] = ROUND3_SETS.flat();
