# Apply v0.3.0 Auth Release

Replace these repository paths exactly:

- package.json
- .github/workflows/deploy.yml
- src/App.tsx
- src/main.tsx
- src/styles.css
- src/vite-env.d.ts
- src/components/AuthGate.tsx (new)
- src/lib/supabase.ts (new)

Do not add the patch as a nested folder. Copy each file into the exact matching repository path.

After commit, GitHub Actions must show Build and Deploy success. Test with Admin and PPIC accounts.
