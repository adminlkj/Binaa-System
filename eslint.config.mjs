import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // === TypeScript rules (re-enabled for real audit) ===
    "@typescript-eslint/no-explicit-any": "off", // catch blocks use unknown; Prisma where needs flexibility
    "@typescript-eslint/no-unused-vars": ["error", {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    }],
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "error",
    "@typescript-eslint/prefer-as-const": "off",

    // === React rules ===
    "react-hooks/exhaustive-deps": "warn", // catches stale closures
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off", // Arabic text
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // === Next.js rules ===
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // === General JavaScript rules (re-enabled for real audit) ===
    "prefer-const": "error",
    "no-unused-vars": "off", // handled by @typescript-eslint/no-unused-vars
    "no-console": ["warn", { allow: ["warn", "error"] }], // console.log = warning
    "no-debugger": "error",
    "no-empty": "warn",
    "no-irregular-whitespace": "error",
    "no-case-declarations": "off",
    "no-fallthrough": "error",
    "no-mixed-spaces-and-tabs": "error",
    "no-redeclare": "off",
    "no-undef": "off", // TypeScript handles this — no-undef is redundant for .ts/.tsx
    "no-unreachable": "error",
    "no-useless-escape": "warn",
  },
}, {
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "examples/**",
    "skills/**",
    "scripts/**",
    "mini-services/**",
    "src/app/api/seed/route.ts", // dev-only seed endpoint
    "tailwind.config.ts", // config file, not application code
    "docs/**", // documentation generator script
  ],
}];

export default eslintConfig;
