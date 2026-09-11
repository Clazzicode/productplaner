import type { SimplifiedExperienceLevel } from "@/lib/onboarding/experienceOptions";

interface QuestionCopy {
  title: string;
  hint: string;
  placeholder: string;
}

export interface SimplifiedIntakeCopy {
  product: QuestionCopy;
  features: QuestionCopy;
  priority: QuestionCopy;
  next: QuestionCopy;
  timeline: { title: string; hint: string };
  review: { title: string; cta: string; busy: string };
}

/**
 * Copy for the simplified 5-question intake, keyed by experience level. Same 5
 * questions and fields for both levels — only tone/hand-holding varies (Beginner
 * gets more guidance, Some Experience a lighter touch). Deliberately does NOT
 * reuse roleGuidance.ts's EMPHASIS copy — those strings use exactly the
 * vocabulary (MVP, business value, backlog) this flow exists to avoid. Role-
 * flavored copy here is left for future terminology work.
 */
export const SIMPLIFIED_INTAKE_COPY: Record<SimplifiedExperienceLevel, SimplifiedIntakeCopy> = {
  first_time: {
    product: {
      title: "What is your product?",
      hint: "Tell us what it does today, or what you want to build. A sentence or two is plenty — you can always add more detail later.",
      placeholder: "e.g. An app that helps small coffee shops manage online orders and loyalty points.",
    },
    features: {
      title: "What are the main things you want your product to do?",
      hint: "List them one per line, in your own words — no need for technical detail. Leave this blank if you already covered it above.",
      placeholder: "e.g.\nLet customers order ahead\nShow the shop's daily menu\nSend order-ready notifications",
    },
    priority: {
      title: "What is most important to get done first?",
      hint: "The thing (or things) your product can't work without. This becomes what we build first.",
      placeholder: "e.g.\nLet customers order ahead",
    },
    next: {
      title: "After those first things are done, what would you want to work on next?",
      hint: "What comes right after the essentials. It's fine to leave this blank for now.",
      placeholder: "e.g.\nSend order-ready notifications",
    },
    timeline: {
      title:
        "When would you like the first important part of your product to be ready, and how long can the other things wait?",
      hint: "Pick the range that's closest to what you have in mind.",
    },
    review: {
      title: "Here's your plan",
      cta: "Build my plan",
      busy: "Putting your plan together…",
    },
  },
  some_experience: {
    product: {
      title: "What is your product?",
      hint: "What it does today, or what you're setting out to build.",
      placeholder: "e.g. An app that helps small coffee shops manage online orders and loyalty points.",
    },
    features: {
      title: "What are the main things you want your product to do?",
      hint: "One per line. Skip this if you've already covered it above.",
      placeholder: "e.g.\nLet customers order ahead\nShow the shop's daily menu\nSend order-ready notifications",
    },
    priority: {
      title: "What is most important to get done first?",
      hint: "What's the first, essential slice? This becomes your starting scope.",
      placeholder: "e.g.\nLet customers order ahead",
    },
    next: {
      title: "After those first things are done, what would you want to work on next?",
      hint: "What comes after the essentials — optional for now.",
      placeholder: "e.g.\nSend order-ready notifications",
    },
    timeline: {
      title:
        "When would you like the first important part of your product to be ready, and how long can the other things wait?",
      hint: "Pick the closest range.",
    },
    review: {
      title: "Here's your plan",
      cta: "Build my plan",
      busy: "Putting your plan together…",
    },
  },
};
