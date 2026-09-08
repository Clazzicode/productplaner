// Pure filter logic (Step 9B §10) — every filter here is backed by a real,
// existing field (Capability.isMvp / businessValue / riskLevel, roadmap
// phaseNumber). No Team/Owner/Status filters: that data doesn't exist yet
// (docs/V2-ROADMAP-ARCHITECTURE.md §2/§10).

export interface FilterableFeature {
  isMvp: boolean;
  businessValue: string;
  riskLevel: string | null;
  phaseNumber: number;
}

export interface TimelineFilterState {
  mvpOnly: boolean;
  businessValue: string | null; // null = all
  riskLevel: string | null; // null = all
  phaseNumber: number | null; // null = all
}

export const EMPTY_FILTERS: TimelineFilterState = {
  mvpOnly: false,
  businessValue: null,
  riskLevel: null,
  phaseNumber: null,
};

export function isFilterActive(filters: TimelineFilterState): boolean {
  return (
    filters.mvpOnly || filters.businessValue != null || filters.riskLevel != null || filters.phaseNumber != null
  );
}

export function matchesFilters<T extends FilterableFeature>(feature: T, filters: TimelineFilterState): boolean {
  if (filters.mvpOnly && !feature.isMvp) return false;
  if (filters.businessValue != null && feature.businessValue !== filters.businessValue) return false;
  if (filters.riskLevel != null && feature.riskLevel !== filters.riskLevel) return false;
  if (filters.phaseNumber != null && feature.phaseNumber !== filters.phaseNumber) return false;
  return true;
}

export function filterFeatures<T extends FilterableFeature>(features: T[], filters: TimelineFilterState): T[] {
  return features.filter((f) => matchesFilters(f, filters));
}
