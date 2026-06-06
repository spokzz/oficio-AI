const earthRadiusMiles = 3958.8;

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function distanceMiles(origin, destination) {
  const dLat = toRadians(destination.lat - origin.lat);
  const dLng = toRadians(destination.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInsideServiceRadius(origin, destination, radiusMiles) {
  const miles = distanceMiles(origin, destination);
  return {
    miles: Number(miles.toFixed(1)),
    inside: miles <= radiusMiles
  };
}

export function estimateLandscapingQuote({ yardSize, overgrown, photosCount, recurring }) {
  const sizeBase = {
    small: 140,
    medium: 240,
    large: 380
  };
  const base = sizeBase[yardSize] ?? sizeBase.medium;
  const overgrownFee = overgrown ? 80 : 0;
  const photoConfidenceDiscount = photosCount >= 3 ? 0 : 25;
  const recurringDiscount = recurring ? 20 : 0;
  const recommended = base + overgrownFee + photoConfidenceDiscount - recurringDiscount;

  return {
    low: Math.max(90, recommended - 40),
    high: recommended + 40,
    recommended
  };
}

export function estimateMonthlyGrossMargin({
  monthlyPrice,
  voiceMinutes,
  smsSegments,
  sharedInfraCost = 12,
  aiCostPerMinute = 0.12,
  twilioVoicePerMinute = 0.009,
  smsCostPerSegment = 0.014,
  phoneNumberCost = 1.15
}) {
  const usageCost =
    voiceMinutes * (aiCostPerMinute + twilioVoicePerMinute) +
    smsSegments * smsCostPerSegment +
    sharedInfraCost +
    phoneNumberCost;

  const grossProfit = monthlyPrice - usageCost;
  const margin = grossProfit / monthlyPrice;

  return {
    usageCost: Number(usageCost.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    marginPercent: Number((margin * 100).toFixed(1))
  };
}

