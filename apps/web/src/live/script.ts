// Timings for the simulated previews, in ms per step. Kept apart from the
// (lazily loaded) panels so the section can size its progress bar.

export const TYPE_MS = 40;
export const ASSISTANT_QUESTION = "Who is free this weekend in Lisbon?";

// 0 empty, 1 typing, 2 message, 3 reply, 4 typing, 5 voice note, 6 reply (delivered), 7 read
export const CHAT_STEPS = [500, 1100, 1000, 900, 1100, 1300, 1000] as const;

// 0 empty, 1 typing the question, 2 thinking, 3-5 results one by one, 6 follow-up chips
export const ASSISTANT_STEPS = [400, ASSISTANT_QUESTION.length * TYPE_MS + 300, 1100, 500, 500, 700] as const;

// 0 walking (dot moves), 1 check-in counting down, 2 escalated (final)
export const SAFETY_STEPS = [3000, 3200] as const;

export const total = (steps: readonly number[]) => steps.reduce((a, b) => a + b, 0);
