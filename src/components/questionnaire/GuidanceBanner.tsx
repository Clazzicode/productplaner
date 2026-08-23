import { guidanceFor, type QuestionnaireSection } from "@/lib/questionnaire/roleGuidance";
import type { WorkingRole } from "@/lib/onboarding/types";

/** Section-level Working Role emphasis — same fields for everyone, different framing. */
export default function GuidanceBanner(props: { section: QuestionnaireSection; workingRole: WorkingRole | null }) {
  return (
    <p className="mb-5 rounded-lg bg-indigo-50 px-3.5 py-2.5 text-sm text-indigo-800">
      {guidanceFor(props.section, props.workingRole)}
    </p>
  );
}
