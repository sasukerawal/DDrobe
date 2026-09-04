# AI Workflow Rules (Strict Adherence Required)

The AI Agent MUST follow these rules exactly to ensure project stability and prevent "vibe coding" drift.

## 1. Spec-Driven Implementation
- **NEVER** build features based on a vague prompt like "build the app".
- **ALWAYS** require a specific Markdown spec file (e.g., `01-auth-flow.md`) before writing code.
- Implement exactly what is outlined in the spec file. Do not add extra features (like dark mode toggles or settings pages) unless explicitly requested.

## 2. Context Initialization
- At the start of EVERY session or task, read all 6 files in the `/context` folder to load the project's memory bank into your context.
- Ensure any code generated adheres to the `code_standards.md` and `architecture.md` invariants.

## 3. Progress Tracking
- Open `progress_tracker.md` before starting work to understand where we are.
- Update `progress_tracker.md` immediately upon completing a micro-unit of work, checking off tasks, or adding architectural decisions.

## 4. Single Unit Focus
- Focus on one component or feature at a time.
- DO NOT refactor unrelated files. If you see a bug in an adjacent file, document it in `current_issues.md` rather than attempting a surprise fix that might break the app.

## 5. Debugging Protocol (No Panic Coding)
- If a terminal command fails or an error trace is provided, **STOP**.
- DO NOT blindly replace entire files or invent new dependencies.
- **Step 1:** Analyze the error in thought.
- **Step 2:** Write down the problem and proposed fix in `current_issues.md` (or directly to the user).
- **Step 3:** Confirm the reasoning with the user.
- **Step 4:** Only execute the fix when the logic is fundamentally sound.
- **Step 5:** Use CLI tools (like `npx` help commands) to read documentation if you suspect your syntax is outdated.

## 6. Zero-Cost Imperative
- Before implementing any image processing or AI feature, ensure it respects the "Zero-Cost" rules defined in `architecture.md` (e.g., local background removal, 512x512 low-res OpenAI requests). Do not suggest heavy server-side processing APIs.
