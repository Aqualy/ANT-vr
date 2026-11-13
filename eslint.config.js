import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['src/art/engine.js', 'src/art/real.ts', 'src/art/pictos.ts', 'src/art/logo-paths.ts', 'src/scene-assets/decor.scene-asset.ts', 'src/scene-assets/studio.scene-asset.ts'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], '@typescript-eslint/no-explicit-any': 'error' } },
);
