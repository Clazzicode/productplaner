import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // officeparser's package.json exports a "browser" condition that Next's
  // bundler otherwise picks up for route handlers, resolving to a browser
  // build whose shape doesn't match the Node API this code calls (surfaced
  // as "Cannot read properties of undefined (reading 'parseOffice')" against
  // a real document upload — not a parsing bug, a bundling one). Marking it
  // external makes Next `require()` it directly from node_modules at
  // runtime instead, honoring Node's own resolution conditions.
  serverExternalPackages: ["officeparser"],
};

export default nextConfig;
