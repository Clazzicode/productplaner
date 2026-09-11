/** The 3 experience levels offered to users, per the platform's beginner/some-
 * experience/experienced model. `QualifyingProfile.experienceLevel` retains a 4th
 * historical value ("expert") in its Zod enum for backward compatibility with
 * existing rows, but it is never offered as a choice again — every place that
 * branches on experience level treats "expert" identically to "experienced"
 * (see `isSimplifiedIntakeExperience` / `depthFromExperience` in roleGuidance.ts). */
export type SelectableExperienceLevel = "first_time" | "some_experience" | "experienced";

/** The subset of experience levels routed to the simplified intake flow. */
export type SimplifiedExperienceLevel = "first_time" | "some_experience";

export const EXPERIENCE_LEVEL_OPTIONS: { value: SelectableExperienceLevel; label: string; hint: string }[] = [
  {
    value: "first_time",
    label: "Beginner",
    hint: "New to formal product planning — we'll keep this simple and guided.",
  },
  {
    value: "some_experience",
    label: "Some Experience",
    hint: "I've put plans together before, informally or with light process.",
  },
  {
    value: "experienced",
    label: "Experienced",
    hint: "I plan products regularly and know the terrain.",
  },
];
