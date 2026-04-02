import { describe, expect, it } from "vitest";
import { allAppRoutes } from "@/lib/manifest";

describe("route manifest", () => {
  it("includes core workflow routes", () => {
    expect(allAppRoutes).toContain("/dashboard");
    expect(allAppRoutes).toContain("/diagnosis");
    expect(allAppRoutes).toContain("/trademark/check");
    expect(allAppRoutes).toContain("/trademark/application");
    expect(allAppRoutes).toContain("/trademark/submit");
    expect(allAppRoutes).toContain("/assets");
    expect(allAppRoutes).toContain("/reminders");
  });

  it("includes all skeleton routes", () => {
    expect(allAppRoutes).toContain("/monitoring");
    expect(allAppRoutes).toContain("/competitors");
    expect(allAppRoutes).toContain("/contracts");
    expect(allAppRoutes).toContain("/patents");
    expect(allAppRoutes).toContain("/policies");
    expect(allAppRoutes).toContain("/due-diligence");
  });
});
