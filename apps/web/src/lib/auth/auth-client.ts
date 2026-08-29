"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import { getApiBaseUrl } from "@/lib/net/config";

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
  plugins: [magicLinkClient()],
});
