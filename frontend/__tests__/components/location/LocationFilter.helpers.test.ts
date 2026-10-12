/**
 * Tests for the URL <-> LocationFilter helpers that back every search surface
 * (Jobs / People / Companies / Resumes / UnifiedSearch / HeaderSearch). These
 * are pure functions: no DOM, no async, no mocks. They guard the wire format
 * so deep-links survive cross-surface navigation.
 */

import { describe, it, expect } from "vitest";
import {
  locationFilterFromQuery,
  applyLocationFilterToQuery,
} from "@/components/location/LocationFilter";

describe("locationFilterFromQuery", () => {
  it("returns an empty filter for an empty query string", () => {
    const filter = locationFilterFromQuery(new URLSearchParams(""));
    expect(filter.countryId).toBeUndefined();
    expect(filter.stateId).toBeUndefined();
    expect(filter.cityId).toBeUndefined();
    expect(filter.latitude).toBeUndefined();
    expect(filter.longitude).toBeUndefined();
    expect(filter.radiusKm).toBeUndefined();
    expect(filter.remote).toBeUndefined();
    expect(filter.text).toBeUndefined();
  });

  it("hydrates a full structured filter from URL params", () => {
    const qs = new URLSearchParams(
      "countryId=1&stateId=st-ca&cityId=ct-sf&lat=37.77&lng=-122.42&radiusKm=25&isRemote=true&location=San%20Francisco%2C%20CA",
    );
    const filter = locationFilterFromQuery(qs);
    expect(filter.countryId).toBe(1);
    expect(filter.stateId).toBe("st-ca");
    expect(filter.cityId).toBe("ct-sf");
    expect(filter.latitude).toBe(37.77);
    expect(filter.longitude).toBe(-122.42);
    expect(filter.radiusKm).toBe(25);
    expect(filter.remote).toBe(true);
    expect(filter.text).toBe("San Francisco, CA");
  });

  it("accepts the legacy `remote` param (older saved searches + alert links)", () => {
    const qs = new URLSearchParams("remote=true");
    expect(locationFilterFromQuery(qs).remote).toBe(true);
  });

  it("distinguishes remote=false from unset (so 'on-site only' deep-links work)", () => {
    expect(locationFilterFromQuery(new URLSearchParams("isRemote=false")).remote).toBe(false);
    expect(locationFilterFromQuery(new URLSearchParams("")).remote).toBeUndefined();
  });
});

describe("applyLocationFilterToQuery", () => {
  it("clears every geo param when given an empty filter", () => {
    const qs = new URLSearchParams(
      "countryId=1&stateId=st-x&cityId=ct-y&lat=1&lng=2&radiusKm=3&isRemote=true&location=foo",
    );
    applyLocationFilterToQuery(qs, {});
    expect(qs.get("countryId")).toBeNull();
    expect(qs.get("stateId")).toBeNull();
    expect(qs.get("cityId")).toBeNull();
    expect(qs.get("lat")).toBeNull();
    expect(qs.get("lng")).toBeNull();
    expect(qs.get("radiusKm")).toBeNull();
    expect(qs.get("isRemote")).toBeNull();
    expect(qs.get("location")).toBeNull();
  });

  it("writes a structured filter back to URL params", () => {
    const qs = new URLSearchParams();
    applyLocationFilterToQuery(qs, {
      countryId: 1,
      stateId: "st-ca",
      cityId: "ct-sf",
      latitude: 37.77,
      longitude: -122.42,
      radiusKm: 25,
      remote: true,
      text: "San Francisco, CA",
    });
    expect(qs.get("countryId")).toBe("1");
    expect(qs.get("stateId")).toBe("st-ca");
    expect(qs.get("cityId")).toBe("ct-sf");
    expect(qs.get("lat")).toBe("37.77");
    expect(qs.get("lng")).toBe("-122.42");
    expect(qs.get("radiusKm")).toBe("25");
    expect(qs.get("isRemote")).toBe("true");
    expect(qs.get("location")).toBe("San Francisco, CA");
  });

  it("preserves unrelated params (so list_id / tab / q survive a filter change)", () => {
    const qs = new URLSearchParams("tab=available&list_id=L-123&q=engineer");
    applyLocationFilterToQuery(qs, { text: "Remote" });
    expect(qs.get("tab")).toBe("available");
    expect(qs.get("list_id")).toBe("L-123");
    expect(qs.get("q")).toBe("engineer");
    expect(qs.get("location")).toBe("Remote");
  });
});

describe("LocationFilter URL round-trip", () => {
  it("survives apply -> hydrate -> apply with the same structured values", () => {
    const original = {
      countryId: 124,
      stateId: "st-on",
      cityId: "ct-toronto",
      latitude: 43.65,
      longitude: -79.38,
      radiusKm: 50,
      remote: true,
      text: "Toronto, ON",
    };

    const qs = new URLSearchParams();
    applyLocationFilterToQuery(qs, original);

    const rehydrated = locationFilterFromQuery(qs);
    expect(rehydrated).toEqual(original);

    // Re-apply to a fresh query — output should be byte-identical so deep-links
    // are stable regardless of which surface wrote them.
    const qs2 = new URLSearchParams();
    applyLocationFilterToQuery(qs2, rehydrated);
    expect(qs2.toString()).toBe(qs.toString());
  });
});
