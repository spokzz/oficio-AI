"use client";

import { useEffect } from "react";

export default function HomePage() {
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const isRecoveryLink = hashParams.get("type") === "recovery" && hashParams.has("access_token");

    if (isRecoveryLink) {
      const portal = window.localStorage.getItem("oficio-password-reset-portal") === "admin" ? "admin" : "owner";
      window.location.replace(`/auth/reset-password?portal=${portal}${window.location.hash}`);
    } else {
      window.location.replace("/owner");
    }
  }, []);

  return null;
}
