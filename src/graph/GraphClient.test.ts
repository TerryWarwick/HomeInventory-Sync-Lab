import { describe, expect, it } from "vitest";
import {
  GraphError,
  isNewConsentServiceReadOnly,
} from "./GraphClient";

describe("new-consent OneDrive incident detection", () => {
  it("recognizes the personal OneDrive serviceReadOnly response", () => {
    const error = new GraphError(
      "Microsoft Graph request failed (403).",
      403,
      null,
      '{"error":{"code":"accessDenied","message":"Database Is Read Only","innerError":{"code":"serviceReadOnly"}}}',
    );

    expect(isNewConsentServiceReadOnly(error)).toBe(true);
  });

  it("does not hide unrelated access-denied responses", () => {
    const error = new GraphError(
      "Microsoft Graph request failed (403).",
      403,
      null,
      '{"error":{"code":"accessDenied","message":"Access denied"}}',
    );

    expect(isNewConsentServiceReadOnly(error)).toBe(false);
  });
});
