"use client";

import { useMemo } from "react";
import { createApiClient } from "@/lib/api";

export function useApi(token?: string | null) {
  return useMemo(() => createApiClient(token ?? undefined), [token]);
}
