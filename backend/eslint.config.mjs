import js from "@eslint/js";

/**
 * TypeScript-syntax-aware linting without typescript-eslint: this repo's
 * `typescript` devDependency is v7 (the new Go-based compiler), which
 * typescript-eslint doesn't support yet (it hard-errors: "typescript-eslint
 * does not support TS 7.0" — not just a peer-dependency warning). Babel's
 * parser strips TypeScript syntax without needing the TypeScript package at
 * all, so linting here isn't coupled to that compatibility gap. Full type
 * checking already happens separately via `npm run typecheck` (tsc) — this
 * config is deliberately syntax/style rules only, not type-aware ones.
 */
export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: (await import("@babel/eslint-parser")).default,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { presets: ["@babel/preset-typescript"] },
        sourceType: "module",
      },
    },
    rules: {
      // Babel parses TS syntax but doesn't understand TS types, so two
      // eslint:recommended rules are unreliable here and are turned off
      // rather than left to cry wolf on every file:
      //  - no-undef: has no notion of a type-only namespace/interface.
      //  - no-unused-vars: a binding used only in a type position (the
      //    common `import type { Request, Response } from "express"` used
      //    solely as parameter annotations, all over this codebase) looks
      //    unused once Babel strips the type positions, even though it's
      //    genuinely referenced. `npm run typecheck` (tsc, which does
      //    understand type-only usage) is what actually enforces both.
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];
