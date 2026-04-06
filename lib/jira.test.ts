import { describe, expect, it } from "vitest";
import { adfToPlainText } from "./jira-adf";
import { normalizeJiraHost } from "./jira";

describe("normalizeJiraHost", () => {
  it("strips protocol and path", () => {
    expect(normalizeJiraHost("https://acme.atlassian.net/foo")).toBe(
      "acme.atlassian.net",
    );
    expect(normalizeJiraHost("acme.atlassian.net")).toBe("acme.atlassian.net");
  });
});

describe("adfToPlainText", () => {
  it("extracts text nodes", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello" }, { type: "hardBreak" }, { type: "text", text: "World" }],
        },
      ],
    };
    expect(adfToPlainText(doc)).toContain("Hello");
    expect(adfToPlainText(doc)).toContain("World");
  });
});
