# RC1 Release Preparation: Code Cleanup & Optimization

## Objective
Prepare this Next.js 2.3 project for Release Candidate 1 by removing all test/debug code and performing a comprehensive code review for efficiency and dead code elimination.

## Pre-Flight Checks
Before beginning analysis, verify:
1. `npx supabase gen types typescript --project-id <project-id> > types/supabase.ts` — regenerate latest DB types
2. `npx tailwindcss --content './src/**/*.{js,ts,jsx,tsx}' --output unused-check.css` — verify content paths
3. `npm run build` or `next build` — ensure project builds cleanly before changes
4. Note current bundle sizes from build output for comparison

---

## STEP 1: Remove Test & Debug Code

### 1.1 Console Statements
Scan and remove ALL instances of:
- `console.log()`
- `console.warn()` (except intentional production warnings)
- `console.error()` (except intentional error handling)
- `console.debug()`
- `console.trace()`
- `console.table()`
- `console.time()` / `console.timeEnd()`
- `console.group()` / `console.groupEnd()`

### 1.2 Debug Flags & Conditional Debug Code
Remove or disable:
- `if (DEBUG)` or `if (process.env.NODE_ENV === 'development')` blocks containing only debug logic
- `debugger;` statements
- Variables named with patterns: `debug*`, `test*`, `temp*`, `tmp*`, `TODO*`
- Commented-out code blocks (review before deletion)

### 1.3 Test-Related Code in Production Files
Identify and remove:
- Mock data that should only exist in test files
- Test IDs or data-testid attributes (keep if used for E2E testing in production)
- Hardcoded test credentials or API keys
- Test user accounts or bypass authentication flags
- `// @ts-ignore` or `// @ts-expect-error` with TODO comments
- Placeholder/Lorem ipsum content

### 1.4 Development-Only Dependencies Check
Flag any imports from:
- Test utilities in production code
- Development-only packages being imported in production bundles

### 1.5 Environment Variable Audit
- List all `process.env.*` usages
- Verify no development-only env vars are required in production
- Check for hardcoded fallback values that expose sensitive defaults

---

## STEP 2: Code Review & Optimization

### 2.1 Dead Code Elimination

#### Unused Exports
Scan for and remove:
- Exported functions never imported elsewhere
- Exported constants never referenced
- Exported types/interfaces never used

#### Unused Imports
Remove all:
- Imported modules never used in the file
- Imported types never referenced
- Destructured imports where some properties are unused

#### Unused Variables & Functions
Identify and remove:
- Declared variables never read
- Function parameters never used (consider if API contract requires them)
- Private functions never called
- React components never rendered

#### Unused Files
Flag files that:
- Are never imported by any other file
- Contain only commented-out code
- Are duplicates or old versions (e.g., `Component.old.tsx`, `utils.backup.js`)

### 2.2 Code Efficiency Review

#### React-Specific Optimizations
- Identify components that should be wrapped in `React.memo()`
- Find `useMemo()` and `useCallback()` opportunities for expensive computations
- Check for unnecessary re-renders from inline object/array/function creation in JSX
- Verify `useEffect` dependencies are correct and minimal
- Look for state that could be derived instead of stored

#### Next.js Specific
- Verify proper use of `'use client'` vs Server Components
- Check for components that could be Server Components but aren't
- Review `getServerSideProps` / `getStaticProps` for efficiency
- Verify dynamic imports are used for code splitting where appropriate
- Check Image component usage for proper optimization props

#### General Optimizations
- Identify repeated code blocks that should be abstracted into utilities
- Find complex conditionals that could be simplified
- Look for nested loops that could be optimized
- Check for synchronous operations that should be async
- Identify string concatenation that should use template literals
- Find array methods that could be combined (e.g., `.filter().map()` → single `.reduce()`)

### 2.3 Type Safety Audit (TypeScript)
- Remove all `any` types and replace with proper types
- Eliminate unnecessary type assertions (`as Type`)
- Check for `!` non-null assertions that could be replaced with proper null checks
- Verify all function return types are explicitly declared
- Ensure no implicit `any` from missing type definitions

### 2.4 Bundle Size Analysis
- Identify large dependencies that could be replaced with lighter alternatives
- Find dynamic imports that should be lazy loaded
- Check for barrel file imports that could be direct imports
- Flag any development-only code that might be included in production bundle

---

## Execution Instructions

### Phase 1: Analysis (Read-Only)
1. Scan the entire codebase without making changes
2. Generate a report listing all findings organized by category
3. Prioritize findings by: Critical → High → Medium → Low
4. **Flag any Supabase security issues as CRITICAL**
5. Present the report for review before proceeding

### Phase 2: Step 1 Implementation (Debug/Test Removal)
1. After approval, remove all test/debug code
2. Remove Supabase-specific debug code (Step 3.1)
3. Commit changes with message: `chore: remove test and debug code for RC1`
4. Verify the application still builds and runs
5. Verify Supabase connections still work

### Phase 3: Step 2 Implementation (Dead Code & Optimization)
1. Remove dead code (unused exports, imports, variables, files)
2. Commit with message: `refactor: remove dead code`
3. Apply efficiency optimizations
4. Commit with message: `refactor: code optimizations for RC1`

### Phase 4: Step 3 Implementation (Supabase Optimization)
1. Address security findings (MUST complete before RC1)
2. Optimize Supabase queries and client usage
3. Verify realtime subscriptions have proper cleanup
4. Commit with message: `refactor: supabase optimizations for RC1`

### Phase 5: Step 4 Implementation (Tailwind Cleanup)
1. Run Tailwind purge analysis
2. Remove unused classes and consolidate patterns
3. Clean up tailwind.config.js
4. Commit with message: `refactor: tailwind css cleanup for RC1`
5. Final build and visual regression check

### Phase 6: Final Report
Generate a summary including:
- Total files modified
- Lines of code removed
- Estimated bundle size impact
- List of any flagged items requiring manual review
- Verification that all tests pass (if test suite exists)

---

---

## STEP 3: Supabase-Specific Review

### 3.1 Debug & Test Code Removal
- Remove `console.log()` statements logging Supabase responses or errors
- Remove hardcoded test UUIDs or user IDs
- Remove test RLS bypass logic or service role key usage in client code
- Remove mock Supabase client implementations
- Check for `.single()` calls with debug error handling that exposes data structure

### 3.2 Security Audit
- **CRITICAL**: Verify `SUPABASE_SERVICE_ROLE_KEY` is NEVER exposed in client-side code
- Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the only key in client bundles
- Check for hardcoded connection strings or credentials
- Verify RLS policies are not being bypassed in production code
- Remove any `{ auth: { persistSession: false } }` test configurations

### 3.3 Query Optimization
- Identify repeated queries that should use React Query/SWR caching
- Find `.select('*')` calls that should specify exact columns needed
- Look for N+1 query patterns (queries inside loops)
- Check for missing `.eq()`, `.in()`, or filter optimizations
- Identify queries that could use database functions/views instead
- Find real-time subscriptions that aren't properly cleaned up in `useEffect` return

### 3.4 Client Instance Management
- Verify single Supabase client instance pattern (not creating new clients per request)
- Check for proper server vs client Supabase client usage in Next.js App Router
- Ensure `createServerComponentClient` / `createClientComponentClient` are used correctly
- Remove duplicate client initialization code

### 3.5 Type Safety
- Verify database types are generated and up-to-date (`supabase gen types typescript`)
- Remove `any` types on Supabase query responses
- Check for proper typing on `.insert()`, `.update()`, `.upsert()` payloads
- Ensure error handling uses proper Supabase error types

### 3.6 Subscription & Realtime Cleanup
- Verify all realtime subscriptions have cleanup functions
- Check for orphaned channel subscriptions
- Remove test channels or debug subscription logging
- Ensure proper `channel.unsubscribe()` in useEffect cleanup

---

## STEP 4: Tailwind CSS Review

### 4.1 Unused Class Removal
- Run Tailwind's built-in purge/content analysis
- Identify custom classes in `tailwind.config.js` that are never used
- Find inline styles that should be Tailwind classes
- Remove duplicate utility class applications (e.g., `mt-4 mt-6` on same element)

### 4.2 Class Optimization
- Consolidate repeated class patterns into `@apply` components or CSS modules
- Find overly specific responsive variants that could be simplified
- Identify `!important` overrides that indicate specificity issues
- Check for conflicting classes on same element (e.g., `text-red-500 text-blue-500`)

### 4.3 Configuration Cleanup
- Remove unused color definitions in `tailwind.config.js`
- Remove unused font family definitions
- Clean up unused custom spacing, breakpoints, or animations
- Verify `content` paths are correct and not scanning unnecessary directories

### 4.4 Performance Optimizations
- Identify components with excessive class strings that could use `clsx`/`cn` utility
- Check for conditional classes that could be simplified
- Find inline Tailwind classes in map/loop renders that should be extracted
- Verify JIT mode is enabled for production builds

### 4.5 Dark Mode & Theme Consistency
- Check for hardcoded colors that should use CSS variables or theme tokens
- Verify dark mode classes are consistently applied where needed
- Remove debug theme toggle code or test theme overrides
- Ensure `dark:` variants are actually being used if dark mode is supported

### 4.6 Responsive Design Audit
- Identify mobile-first violations (desktop styles without responsive variants)
- Find redundant breakpoint classes (same value at multiple breakpoints)
- Check for missing responsive handling on critical UI components

---

## Exclusions
Do NOT remove or modify:
- Intentional error logging for production monitoring
- Analytics or telemetry code
- Feature flags for gradual rollout
- Accessibility attributes
- SEO-related metadata
- License headers or legal comments
- Supabase RLS policy comments or documentation
- Tailwind `safelist` classes (intentionally preserved)
- CSS custom properties used for theming
- Supabase Edge Function or database migration files
- Environment variable type definitions

---

## Output Format
For each finding, report:
```
[SEVERITY] [CATEGORY] [FILE:LINE]
Description: What was found
Action: What will be done
Impact: Why this matters
```

Begin with Phase 1 Analysis. Scan the project starting from the root directory and report findings before making any changes.
