/**
 * Copy for the simplified intake flow, keyed by experience level.
 *
 * Guided-activation restructure (reference doc §4/§5): Beginner and Some
 * Experience now ask genuinely different question sets (previously identical
 * content with only tone differences) — Beginner gets 5 questions including
 * "who will use it" and a two-part prioritization step; Some Experience gets
 * a shorter 4-question set that adds a planning-methodology question Beginner
 * never sees and skips the audience question entirely. Two separate copy
 * shapes reflect that real structural difference rather than forcing both
 * through one interface. Deliberately does NOT reuse roleGuidance.ts's
 * EMPHASIS copy — those strings use exactly the vocabulary (MVP, business
 * value, backlog) this flow exists to avoid.
 */

interface QuestionCopy {
  title: string;
  hint: string;
  placeholder: string;
}

export interface BeginnerIntakeCopy {
  product: QuestionCopy;
  audience: { title: string; hint: string };
  features: QuestionCopy;
  priority: QuestionCopy;
  next: QuestionCopy;
  timeline: { title: string; hint: string };
  review: { title: string; cta: string; busy: string };
}

export const BEGINNER_INTAKE_COPY: BeginnerIntakeCopy = {
  product: {
    title: "What are you building or trying to improve?",
    hint: "Tell us what the product, service, system, or idea is and what you want it to do. A sentence or two is plenty — you can always add more detail later.",
    placeholder: "e.g. An app that helps small coffee shops manage online orders and loyalty points.",
  },
  audience: {
    title: "Who will use it?",
    hint: "Pick everything that applies, and add anything else in your own words.",
  },
  features: {
    title: "What are the most important things it needs to do?",
    hint: "List them one per line, in your own words — no need for technical detail.",
    placeholder: "e.g.\nLet customers order ahead\nShow the shop's daily menu\nSend order-ready notifications",
  },
  priority: {
    title: "What needs to happen first?",
    hint: "The thing (or things) your product can't work without. This becomes what we build first — everything else you listed defaults to later, no rush.",
    placeholder: "e.g.\nLet customers order ahead",
  },
  next: {
    title: "What's important, but can follow after that?",
    hint: "What comes right after the essentials. It's fine to leave this blank for now — anything unmentioned just waits until later.",
    placeholder: "e.g.\nSend order-ready notifications",
  },
  timeline: {
    title: "When would you like the different parts of this work completed?",
    hint: "Pick the range that's closest to what you have in mind — it's fine to not know yet.",
  },
  review: {
    title: "Here's your plan",
    cta: "Build my plan",
    busy: "Putting your plan together…",
  },
};

export interface SomeExperienceIntakeCopy {
  product: QuestionCopy;
  outcome: QuestionCopy;
  features: QuestionCopy;
  methodology: { title: string; hint: string };
  timeline: { title: string; hint: string };
  review: { title: string; cta: string; busy: string };
}

export const SOME_EXPERIENCE_INTAKE_COPY: SomeExperienceIntakeCopy = {
  product: {
    title: "What are you planning?",
    hint: "The product, service, or initiative name — what it is, in a sentence or two.",
    placeholder: "e.g. A coffee-shop ordering app with online payments and loyalty points.",
  },
  outcome: {
    title: "What's the outcome you're aiming for?",
    hint: "What changes once this ships — for customers, the business, or both.",
    placeholder: "e.g. Cut average order wait time in half and increase repeat visits.",
  },
  features: {
    title: "What are the major things you already know need to be delivered?",
    hint: "One per line. These are treated as your must-deliver scope — nothing here needs re-prioritizing.",
    placeholder: "e.g.\nOnline ordering\nPayment processing\nLoyalty point tracking",
  },
  methodology: {
    title: "How would you like to plan the work?",
    hint: "Changes locking rules and how sprints get packed — not what gets built.",
  },
  timeline: {
    title: "What is your expected timeline?",
    hint: "Pick the closest range, or tell us you're not sure yet.",
  },
  review: {
    title: "Here's your plan",
    cta: "Build my plan",
    busy: "Putting your plan together…",
  },
};
