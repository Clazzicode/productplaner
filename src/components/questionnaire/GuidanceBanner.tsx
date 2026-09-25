import { guidanceFor, type QuestionnaireSection } from "@/lib/questionnaire/roleGuidance";
import type { WorkingRole } from "@/lib/onboarding/types";

/** Section-level Working Role emphasis — same fields for everyone, different framing. */
export default function GuidanceBanner(props: { section: QuestionnaireSection; workingRole: WorkingRole | null }) {
  return (
    <div className="mb-7 rounded-r-lg border-l-2 border-accent bg-neutral-50 py-2.5 pl-4 pr-3.5">
      <p className="text-sm leading-relaxed text-text-secondary">
        {guidanceFor(props.section, props.workingRole)}
      </p>
    </div>
  );
}
