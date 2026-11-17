import type { NextConfig } from "next";

// NEXT_PUBLIC_* values are bundled into browser JavaScript. Refuse to build if a Supabase
// secret/service-role key was pasted into one, so it can never be shipped to visitors.
function assertNoSecretsInPublicEnv() {
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
    let serviceRoleJwt = false;
    try {
      serviceRoleJwt = JSON.parse(Buffer.from(value.split(".")[1] ?? "", "base64url").toString()).role === "service_role";
    } catch {}
    if (value.startsWith("sb_secret_") || serviceRoleJwt) {
      throw new Error(`${name} contains a Supabase SECRET key. Put it in SUPABASE_SECRET_KEY and use the publishable key here.`);
    }
  }
}
assertNoSecretsInPublicEnv();

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
