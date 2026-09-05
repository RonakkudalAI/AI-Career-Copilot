import type { Question } from "@/features/interview/types";

const ROLE = "{role}";

const BANK: Record<string, Array<{ question: string; question_type: string }>> = {
  mixed: [
    {
      question: `To start — walk me through your background and how you'd show up in a ${ROLE} seat.`,
      question_type: "hr",
    },
    {
      question: `Tell me about a problem you actually had to untangle. What was going on, and what did you do?`,
      question_type: "behavioural",
    },
    {
      question: `When the brief is messy and people want everything, how do you decide what to do first?`,
      question_type: "technical",
    },
    {
      question: `Have you ever been on a different page from someone you had to ship with? How did you handle that?`,
      question_type: "behavioural",
    },
    {
      question: `Say something you shipped starts misbehaving in production. Where do you start?`,
      question_type: "technical",
    },
    {
      question: `What does owning a piece of work look like for you, day to day, in a ${ROLE} role?`,
      question_type: "hr",
    },
    {
      question: `Is there a project you'd run differently if you did it again? Why?`,
      question_type: "behavioural",
    },
    {
      question: `How do you know a change is safe enough to ship?`,
      question_type: "technical",
    },
  ],
  behavioural: [
    {
      question: `Tell me about a time your plan changed halfway through. What did you do?`,
      question_type: "behavioural",
    },
    {
      question: `Walk me through a disagreement on a team. How did it land?`,
      question_type: "behavioural",
    },
    {
      question: `Give me a time you had to get people on board without being their manager.`,
      question_type: "behavioural",
    },
    {
      question: `Tell me about a miss you owned. What did you change afterward?`,
      question_type: "behavioural",
    },
    {
      question: `When did you have to deliver on a tight clock? How did you choose the tradeoffs?`,
      question_type: "behavioural",
    },
    {
      question: `Describe a time you got hard feedback. What did you do next?`,
      question_type: "behavioural",
    },
    {
      question: `Tell me about a time you improved how the work gets done — not just a one-off task.`,
      question_type: "behavioural",
    },
    {
      question: `Give me an example of helping someone else succeed.`,
      question_type: "behavioural",
    },
  ],
  technical: [
    {
      question: `Walk me through how you'd take on a hard technical problem in a ${ROLE} domain.`,
      question_type: "technical",
    },
    {
      question: `How would you design a simple, reliable API for one core workflow?`,
      question_type: "system_design",
    },
    {
      question: `A feature is slow in production. How do you find the cause?`,
      question_type: "technical",
    },
    {
      question: `How do you think about testing, edge cases, and what happens when it fails?`,
      question_type: "technical",
    },
    {
      question: `What would you watch after shipping a risky change?`,
      question_type: "technical",
    },
    {
      question: `How do you keep a codebase easy to change six months later?`,
      question_type: "technical",
    },
    {
      question: `Tell me about a technical call you made and the tradeoff you accepted.`,
      question_type: "technical",
    },
    {
      question: `How would you explain a messy system to someone who doesn't live in the code?`,
      question_type: "technical",
    },
  ],
  hr: [
    {
      question: `Walk me through your background, focused on work that would matter for a ${ROLE} role.`,
      question_type: "hr",
    },
    {
      question: `Why this kind of role, and why now?`,
      question_type: "hr",
    },
    {
      question: `How do you like to work with a manager and a team?`,
      question_type: "hr",
    },
    {
      question: `What are you looking for in your next role?`,
      question_type: "hr",
    },
    {
      question: `Tell me about a time you had to learn something quickly.`,
      question_type: "hr",
    },
    {
      question: `How do you handle competing priorities when everything is labeled urgent?`,
      question_type: "hr",
    },
    {
      question: `What's a strength you'd actually use in the first few weeks?`,
      question_type: "hr",
    },
    {
      question: `What's something you're still working to get better at?`,
      question_type: "hr",
    },
  ],
  role: [
    {
      question: `What does a strong ${ROLE} actually do in the first 90 days?`,
      question_type: "role",
    },
    {
      question: `Walk me through a piece of work that shows you can do this ${ROLE} job.`,
      question_type: "behavioural",
    },
    {
      question: `Which parts of a ${ROLE} role are you strongest in, and which are you still building?`,
      question_type: "hr",
    },
    {
      question: `How would you measure success in this ${ROLE} seat after six months?`,
      question_type: "role",
    },
    {
      question: `Describe a stakeholder you had to keep aligned while you were delivering.`,
      question_type: "behavioural",
    },
    {
      question: `What's the hardest part of this ${ROLE} work, in your experience?`,
      question_type: "role",
    },
  ],
};

function interpolate(template: string, role: string): string {
  const label = role.trim() || "this role";
  return template.replaceAll(ROLE, label);
}

export function openingSpokenLine(role?: string | null): string {
  const label = (role || "").trim();
  return label
    ? `Thanks for sitting down with me. Let's talk about ${label}.`
    : "Thanks for sitting down with me. Let's start.";
}

export function spokenQuestionLine(options: {
  question: string;
  isFirst: boolean;
  isFollowUp: boolean;
  role?: string | null;
}): string {
  const question = String(options.question || "").trim();
  if (!question) return "";
  if (options.isFirst && !options.isFollowUp) {
    return `${openingSpokenLine(options.role)} ${question}`;
  }
  if (options.isFollowUp) {
    return `Okay. ${question}`;
  }
  return `Alright. ${question}`;
}

export function buildLiveQuestions(options: {
  mode: string;
  count: number;
  targetRole?: string | null;
}): Question[] {
  const mode = (options.mode || "mixed").trim().toLowerCase();
  const bank = BANK[mode] || BANK.mixed;
  const count = Math.max(1, Math.min(Number(options.count) || 5, 8));
  const role = options.targetRole || "";
  return bank.slice(0, count).map((item, index) => ({
    id: `live-q-${index + 1}`,
    position: index + 1,
    question: interpolate(item.question, role),
    question_type: item.question_type,
    source_context: { provider: "live_bank", kind: "seed" },
  }));
}

export function liveFollowUpQuestion(id: string, position: number, question: string): Question {
  return {
    id,
    position,
    question,
    question_type: "follow_up",
    source_context: { provider: "live_turn", kind: "follow_up" },
  };
}
