import assert from "node:assert/strict";
import fs from "node:fs";
import { estimateLandscapingQuote, estimateMonthlyGrossMargin, isInsideServiceRadius } from "../shared/domain.js";
import { pricingPlan } from "../shared/data.js";
import { createActiveVoiceCallRegistry } from "../shared/active-voice-call-registry.js";

const chicago = { lat: 41.8529, lng: -87.6532 };
const nearby = { lat: 41.8781, lng: -87.6298 };
const farAway = { lat: 42.3314, lng: -83.0458 };

const nearResult = isInsideServiceRadius(chicago, nearby, 30);
assert.equal(nearResult.inside, true, "Nearby lead should be inside 30-mile radius");

const farResult = isInsideServiceRadius(chicago, farAway, 30);
assert.equal(farResult.inside, false, "Detroit lead should be outside 30-mile radius");

const quote = estimateLandscapingQuote({
  yardSize: "medium",
  overgrown: true,
  photosCount: 3,
  recurring: false
});
assert.deepEqual(quote, { low: 280, high: 360, recommended: 320 });

const margin = estimateMonthlyGrossMargin({
  monthlyPrice: pricingPlan.monthlyPrice,
  voiceMinutes: 200,
  smsSegments: 500
});
assert.equal(margin.marginPercent > 60, true, "Growth plan should preserve >60% gross margin at included usage");

const ownerDataSource = fs.readFileSync(new URL("../lib/owner-data.ts", import.meta.url), "utf8");
assert.equal(ownerDataSource.includes("tryTranslateOwnerText"), false, "Owner dashboard data loading should not call OpenAI translation");
assert.equal(ownerDataSource.includes("ownerTranslationConfigured"), false, "Owner dashboard data loading should use cached translations only");

const registry = createActiveVoiceCallRegistry();
const callA = { businessId: "business-1", status: "active_with_ana", twilioCallSid: "CA_A", twilioStreamSid: "MS_A" };
const callB = { businessId: "business-1", status: "active_with_ana", twilioCallSid: "CA_B", twilioStreamSid: "MS_B" };
registry.add(callA);
registry.add(callB);
assert.equal(registry.getByCallSid("CA_A"), callA, "CallSid A should resolve to call A");
assert.equal(registry.getByStreamSid("MS_A"), callA, "StreamSid A should resolve to call A");
assert.equal(registry.getByStreamSid("MS_B"), callB, "StreamSid B should resolve to call B");
assert.equal(registry.countActiveForBusiness("business-1"), 2, "Registry should count simultaneous active calls per business");
registry.remove(callA);
assert.equal(registry.getByStreamSid("MS_A"), undefined, "Stopping call A should remove only StreamSid A");
assert.equal(registry.getByStreamSid("MS_B"), callB, "Stopping call A should not remove call B");

console.log("All tests passed.");
