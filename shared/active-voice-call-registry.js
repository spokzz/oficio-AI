export function createActiveVoiceCallRegistry() {
  const activeCallsByCallSid = new Map();
  const activeCallsByStreamSid = new Map();

  function add(call) {
    if (call.twilioCallSid) activeCallsByCallSid.set(call.twilioCallSid, call);
    if (call.twilioStreamSid) activeCallsByStreamSid.set(call.twilioStreamSid, call);
    return call;
  }

  function updateStreamSid(call, streamSid) {
    if (call.twilioStreamSid) activeCallsByStreamSid.delete(call.twilioStreamSid);
    call.twilioStreamSid = streamSid || null;
    call.streamSid = call.twilioStreamSid;
    if (call.twilioStreamSid) activeCallsByStreamSid.set(call.twilioStreamSid, call);
    return call;
  }

  function remove(call) {
    if (!call) return;
    if (call.twilioCallSid) activeCallsByCallSid.delete(call.twilioCallSid);
    if (call.twilioStreamSid) activeCallsByStreamSid.delete(call.twilioStreamSid);
  }

  function countActiveForBusiness(businessId) {
    let count = 0;
    for (const call of activeCallsByCallSid.values()) {
      if (call.businessId === businessId && call.status === "active_with_ana") count += 1;
    }
    return count;
  }

  return {
    activeCallsByCallSid,
    activeCallsByStreamSid,
    add,
    countActiveForBusiness,
    getByCallSid: (callSid) => activeCallsByCallSid.get(callSid),
    getByStreamSid: (streamSid) => activeCallsByStreamSid.get(streamSid),
    remove,
    updateStreamSid
  };
}
