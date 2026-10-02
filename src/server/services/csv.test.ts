import { describe, it, expect } from "vitest";
import { parseCsv, mapContactCsv } from "./csv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const csv = 'name,note\n"Doe, Jane","She said ""hi"""';
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Doe, Jane", 'She said "hi"'],
    ]);
  });

  it("handles CRLF line endings and trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops fully blank lines", () => {
    expect(parseCsv("a,b\n\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("mapContactCsv", () => {
  it("maps aliased headers to contact fields", () => {
    const table = parseCsv(
      "First Name,Last Name,Email,Company\nJane,Doe,jane@acme.com,Acme",
    );
    const { rows, errors } = mapContactCsv(table);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@acme.com",
      phone: undefined,
      title: undefined,
      company: "Acme",
    });
  });

  it("errors when there is no first name column", () => {
    const { rows, errors } = mapContactCsv(parseCsv("email\nx@y.com"));
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatch(/first name/i);
  });

  it("skips rows missing a first name and reports them", () => {
    const table = parseCsv("firstname,email\n,no@name.com\nJane,jane@acme.com");
    const { rows, errors } = mapContactCsv(table);
    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("Jane");
    expect(errors).toHaveLength(1);
  });

  it("reports an empty file", () => {
    expect(mapContactCsv([]).errors[0]).toMatch(/empty/i);
  });
});
