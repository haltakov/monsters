import type { NextConfig } from "next";

const plausibleScriptId =
  process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_ID?.trim() ?? "";
if (plausibleScriptId && !/^pa-[A-Za-z0-9_-]+$/.test(plausibleScriptId)) {
  throw new Error(
    "NEXT_PUBLIC_PLAUSIBLE_SCRIPT_ID must be the pa-… ID from your Plausible snippet (without .js).",
  );
}

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  // Static exports cannot run withPlausibleProxy's Next server rewrites.
  // deploy/nginx.conf.template owns the first-party analytics proxy instead.
  env: { NEXT_PUBLIC_PLAUSIBLE_SCRIPT_ID: plausibleScriptId },
};

export default nextConfig;
