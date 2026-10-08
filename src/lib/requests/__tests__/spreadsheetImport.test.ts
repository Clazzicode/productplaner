import { describe, expect, it } from "vitest";
import type { OfficeContentNode } from "officeparser";
import { parseRequestSpreadsheet, rowsFromNodes } from "../spreadsheetImport";

const cell = (text: string): OfficeContentNode => ({ type: "cell", text, metadata: { row: 0, col: 0 } });
const row = (...values: string[]): OfficeContentNode => ({ type: "row", children: values.map(cell) });

describe("request spreadsheet import", () => {
  it("maps feature and bug rows while retaining the original row", () => {
    const sheet: OfficeContentNode = { type: "sheet", metadata: { sheetName: "Backlog" }, children: [
      row("Title", "Work Type", "Requestor", "Problem", "Requested Change", "Expected Outcome", "Severity", "Affected Area", "Observed Behavior", "Expected Behavior"),
      row("Saved views", "Feature", "Tiana", "Filters are lost", "Save a view", "Restore it"),
      row("Map crash", "Bug", "Avery", "Map closes", "Prevent the crash", "Map stays open", "Critical", "Map", "App closes", "App remains open"),
    ] };
    const result = rowsFromNodes([sheet], "intake.xlsx");
    expect(result).toHaveLength(2);
    expect(result[0].request).toMatchObject({ title: "Saved views", kind: "new_feature", source: "spreadsheet", requestor: "Tiana" });
    expect(result[1].request).toMatchObject({ kind: "bug", bug: { severity: "critical", affectedArea: "Map" } });
    expect(result[1].raw["observed behavior"]).toBe("App closes");
    expect(result[0].request.sourceReference).toContain("Backlog · row 2");
  });

  it("marks incomplete rows for review instead of silently inventing details", () => {
    const sheet: OfficeContentNode = { type: "sheet", metadata: { sheetName: "Requests" }, children: [row("Title", "Type"), row("", "Feature")] };
    expect(rowsFromNodes([sheet], "requests.csv")[0].warnings).toContain("Missing title");
  });
  it("parses an actual CSV upload", async () => {
    const csv = "Title,Work Type,Requestor,Problem,Requested Change,Expected Outcome\nOffline maps,Feature,Tiana,Users lose access,Cache selected maps,Maps work offline\n";
    const result = await parseRequestSpreadsheet(Buffer.from(csv), "requests.csv");
    expect(result[0].request).toMatchObject({ title: "Offline maps", kind: "new_feature", requestor: "Tiana" });
  });
});
