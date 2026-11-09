import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", ".local/**", "qa/**", "tools/**", "**/*.d.mts", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
  ...next,
];

export default config;
