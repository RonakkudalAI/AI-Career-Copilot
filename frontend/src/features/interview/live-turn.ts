const STAR_MARKERS = [
  "situation",
  "task",
  "action",
  "result",
  "because",
  "i led",
  "i owned",
  "we shipped",
  "impact",
  "outcome",
  "measured",
];

const EXAMPLE_MARKERS = [
  "for example",
  "for instance",
  "when i",
  "one time",
  "recently",
  "last year",
  "on a project",
  "at my last",
];

const RESULT_MARKERS = [
  "result",
  "outcome",
  "impact",
  "shipped",
  "reduced",
  "increased",
  "improved",
  "saved",
  "grew",
  "%",
  "percent",
];

const ACTION_MARKERS = [
  "i led",
  "i owned",
  "i built",
  "i shipped",
  "i fixed",
  "i designed",
  "i implemented",
  "i decided",
  "i ran",
  "we shipped",
  "we built",
  "i changed",
  "i moved",
  "profiled",
  "debugged",
  "migrated",
];

export type LiveTurn = {
  should_follow_up: boolean;
  follow_up_question: string | null;
  spoken_reply: string;
};

function countWords(text: string): number {
  return (text.toLowerCase().match(/[a-z']+/g) || []).length;
}

export function followUpBudget(seedCount: number): number {
  const count = Math.max(1, Math.min(seedCount || 5, 20));
  return Math.min(2, Math.max(1, Math.ceil(count / 3)));
}

function moveOn(reply = "Alright, thanks."): LiveTurn {
  return {
    should_follow_up: false,
    follow_up_question: null,
    spoken_reply: reply,
  };
}

function followUp(question: string, reply = "Okay — stay with that for a second."): LiveTurn {
  return {
    should_follow_up: true,
    follow_up_question: question,
    spoken_reply: reply,
  };
}

/**
 * Instant interviewer brain. Default is to move on — follow-ups are earned,
 * not automatic. A real interviewer does not probe every answer.
 */
export function decideInterviewerTurn(options: {
  answer: string;
  question: string;
  questionType?: string | null;
  alreadyFollowedUp?: boolean;
  followUpsUsed?: number;
  seedCount?: number;
}): LiveTurn {
  const text = (options.answer || "").trim();
  const wordCount = countWords(text);
  const lower = text.toLowerCase();
  const q = (options.question || "").trim().toLowerCase();
  const kind = (options.questionType || "").trim().toLowerCase();
  const starHits = STAR_MARKERS.reduce((sum, marker) => sum + (lower.includes(marker) ? 1 : 0), 0);
  const hasExample = EXAMPLE_MARKERS.some((token) => lower.includes(token));
  const hasResult = RESULT_MARKERS.some((token) => lower.includes(token));
  const hasAction = ACTION_MARKERS.some((token) => lower.includes(token));
  const behavioural =
    ["behavioural", "behavioral", "hr", "situational"].includes(kind) ||
    ["tell me about", "a time", "example", "conflict", "challenge"].some((token) => q.includes(token));
  const budget = followUpBudget(options.seedCount ?? 5);
  const used = Math.max(0, options.followUpsUsed ?? 0);

  if (options.alreadyFollowedUp || used >= budget) {
    return moveOn("Thanks, that helps.");
  }
  if (!text) {
    return followUp(
      "Take another pass — what happened, what did you do, and how did it turn out?",
      "I didn't quite catch that.",
    );
  }

  // Thin one-liners still need a second beat. Everything else should usually move on.
  if (wordCount < 8) {
    return followUp(
      "Give me a bit more — what was going on, and what did you actually do?",
      "That's a start. Stay with it.",
    );
  }

  const missingAction = !hasAction && starHits < 1;
  const missingResult = !hasResult;
  const missingExample = !hasExample && wordCount < 22;
  const holes = Number(missingAction) + Number(missingResult) + Number(missingExample);

  if (behavioural && holes >= 2 && wordCount < 36) {
    if (missingAction) {
      return followUp("What did you personally do in that situation?");
    }
    if (missingResult) {
      return followUp("What changed because of that — for you, the team, or the product?");
    }
    return followUp("Can you give me one concrete instance of that?");
  }

  if (!behavioural && wordCount < 10) {
    return followUp("Walk me through that a little more — how would you actually approach it?");
  }

  return moveOn(wordCount >= 28 ? "Okay, that was clear." : "Alright, thanks.");
}

export function maxLiveQuestionBudget(planned: number): number {
  const count = Math.max(1, Math.min(planned || 5, 20));
  return Math.min(20, count + followUpBudget(count));
}
