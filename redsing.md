# ENTERPRISE AUTOMOTIVE ERP
# COMPLETE DESIGN SYSTEM MIGRATION WORKFLOW
# FINAL AI EXECUTION SPECIFICATION

================================================================================
OBJECTIVE
================================================================================

Transform the entire application into a premium enterprise-grade automotive ERP
interface using a centralized Design System architecture.

This is a VISUAL REFACTOR ONLY.

DO NOT modify:

- Business Logic
- Rust Backend
- Database Schema
- Database Operations
- API Calls
- React State
- Routes
- Component Structure
- Window Sizes
- Dialog Sizes
- Input Sizes
- Table Sizes
- Font Sizes
- Existing Layout Structure
- Existing Grid/Flex Structure

The goal is to completely redesign the UI while preserving 100% functionality.

================================================================================
ABSOLUTE RESTRICTIONS
================================================================================

FORBIDDEN:

- Modifying business logic
- Modifying Rust code
- Modifying database logic
- Modifying API behavior
- Modifying React state flow
- Modifying routing
- Modifying component hierarchy
- Modifying widths
- Modifying heights
- Modifying min/max dimensions
- Modifying spacing scale
- Modifying font sizes
- Modifying paddings
- Modifying margins
- Modifying layout behavior

ALLOWED:

- Colors
- Backgrounds
- Gradients
- Borders
- Border colors
- Border radius
- Shadows
- Glass effects
- Transparency
- Blur effects
- Hover effects
- Focus effects
- Animation styling

================================================================================
CORE DESIGN PRINCIPLE
================================================================================

ALL VISUAL VALUES MUST BE CENTRALIZED.

There must be ONE SINGLE SOURCE OF TRUTH for:

- Colors
- Typography
- Radius
- Shadows
- Motion
- Buttons
- Cards
- Inputs
- Tables
- Modals
- Sidebar

No hardcoded visual values may remain inside components.

================================================================================
FINAL PROJECT STRUCTURE
================================================================================

Create:

src/theme/

Structure:

src/theme/
│
├── tokens/
│   ├── colors.ts
│   ├── typography.ts
│   ├── radius.ts
│   ├── spacing.ts
│   ├── shadows.ts
│   └── motion.ts
│
├── ui/
│   ├── buttons.ts
│   ├── cards.ts
│   ├── inputs.ts
│   ├── tables.ts
│   ├── modals.ts
│   ├── sidebar.ts
│   └── layout.ts
│
├── glass/
│   └── glass.ts
│
├── globals.css
├── theme.ts
└── index.ts

================================================================================
STEP 1 — COLORS SYSTEM
================================================================================

File:

src/theme/tokens/colors.ts

ALL COLORS MUST EXIST HERE.

NO COLOR IS ALLOWED INSIDE COMPONENTS.

Required categories:

- Background colors
- Glass colors
- Text colors
- Border colors
- Status colors
- Financial colors

Financial Color Mapping:

Capital     = Blue
Cash        = Green
Profit      = Purple
Expense     = Red
Receivable  = Orange
Payable     = Dark Red
Inventory   = Gray
Investor    = Teal
Partner     = Indigo

Example:

export const COLORS = {

  /* Background */
  background: "#FFFFFF",
  backgroundSoft: "#FAFAFA",

  /* Glass */
  glassWhite: "rgba(255,255,255,0.78)",
  glassStrong: "rgba(255,255,255,0.90)",

  /* Primary */
  primaryRed: "#D32F2F",
  primaryRedHover: "#B71C1C",
  primaryRedSoft: "#FFEBEE",

  /* Text */
  textPrimary: "#111111",
  textSecondary: "#555555",
  textMuted: "#777777",

  /* Border */
  border: "#DADADA",
  borderSoft: "#ECECEC",

  /* Status */
  success: "#2E7D32",
  warning: "#F57C00",
  danger: "#C62828",
  info: "#1976D2",

  /* Financial */
  capital: "#1565C0",
  cash: "#2E7D32",
  profit: "#8E24AA",
  expense: "#C62828",
  receivable: "#EF6C00",
  payable: "#B71C1C",
  inventory: "#616161",
  investor: "#00897B",
  partner: "#3949AB"
}

================================================================================
STEP 2 — TYPOGRAPHY SYSTEM
================================================================================

File:

src/theme/tokens/typography.ts

IMPORTANT:

Read existing font sizes from project.

DO NOT MODIFY THEM.

Only centralize them.

All font sizes must come from this file.

================================================================================
STEP 3 — RADIUS SYSTEM
================================================================================

File:

src/theme/tokens/radius.ts

ALL BORDER RADIUS VALUES MUST COME FROM HERE.

Buttons, cards, inputs, modals and containers must use this file only.

Example:

export const RADIUS = {
  none: "0px",
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "18px",
  full: "9999px"
}

Changing radius here must update the entire application.

================================================================================
STEP 4 — SHADOW SYSTEM
================================================================================

File:

src/theme/tokens/shadows.ts

All shadows must come from here.

No custom shadow values are allowed elsewhere.

Must include:

- sm
- md
- lg
- xl
- glass

================================================================================
STEP 5 — MOTION SYSTEM
================================================================================

File:

src/theme/tokens/motion.ts

All animations and transitions must come from here.

Example:

export const MOTION = {
  fast: "150ms ease-out",
  normal: "250ms ease-out",
  slow: "400ms ease-in-out"
}

No custom animation values elsewhere.

================================================================================
STEP 6 — GLASS SYSTEM
================================================================================

File:

src/theme/glass/glass.ts

Centralize all glassmorphism styles.

Must provide:

- card glass
- modal glass
- sidebar glass
- table glass

================================================================================
STEP 7 — BUTTON SYSTEM
================================================================================

File:

src/theme/ui/buttons.ts

Every button in the application must use this system.

Required variants:

- primary
- secondary
- success
- danger

Rules:

- hover brightness only
- no scale effects
- no movement
- no transform effects

================================================================================
STEP 8 — CARD SYSTEM
================================================================================

File:

src/theme/ui/cards.ts

All cards must use centralized variants.

Examples:

- base
- dashboard
- financial
- inventory

Rules:

- glass background
- premium border
- soft shadow
- hover brightness only

No scaling.

================================================================================
STEP 9 — INPUT SYSTEM
================================================================================

File:

src/theme/ui/inputs.ts

All inputs must use:

- glass background
- gray border
- red focus ring

Do not modify dimensions.

================================================================================
STEP 10 — TABLE SYSTEM
================================================================================

File:

src/theme/ui/tables.ts

All tables must use centralized styles.

Rules:

- glass background
- premium borders
- sticky headers preserved
- zebra rows
- hover red tint
- active red highlight

Do not modify dimensions.

================================================================================
STEP 11 — MODAL SYSTEM
================================================================================

File:

src/theme/ui/modals.ts

ALL MODALS MUST USE THE SAME STYLE SYSTEM.

Rules:

- strong glass effect
- backdrop blur
- unified shadow
- unified border radius

No custom modal styles allowed.

================================================================================
STEP 12 — SIDEBAR SYSTEM
================================================================================

File:

src/theme/ui/sidebar.ts

Rules:

- white glass appearance
- red active indicator
- soft red hover state

Do not modify width.

================================================================================
STEP 13 — THEME ENGINE
================================================================================

File:

src/theme/theme.ts

Aggregate everything:

- colors
- typography
- radius
- shadows
- motion
- glass
- buttons
- cards
- inputs
- tables
- modals
- sidebar

This becomes the application's visual source of truth.

================================================================================
STEP 14 — TAILWIND CONFIG REFACTOR
================================================================================

Update tailwind.config.ts

Extend:

- colors
- shadows
- border radius

Create reusable utilities:

- bg-glass
- card-glass
- modal-glass
- sidebar-glass
- table-glass
- btn-primary
- btn-secondary
- financial-card

DO NOT MODIFY:

- spacing scale
- font scale

================================================================================
STEP 15 — CSS ARCHITECTURE REFACTOR
================================================================================

MANDATORY.

The current project contains many scattered CSS files.

This architecture must be eliminated.

Current example:

src/styles/
├── agencies.css
├── App.css
├── buttons.css
├── card-iqd.css
├── card-usd.css
├── cards.css
├── cars.css
├── colors.css
├── dashboard.css
├── DashboardCardsFix.css
├── expenses.css
├── footer.css
├── inputfield.css
├── modal.css
├── partners.css
├── qasa.css
├── searching.css
├── sidebar.css
├── tables.css
├── topbar.css
└── ...

This structure must be removed completely.

================================================================================
STEP 16 — CSS CONSOLIDATION
================================================================================

Scan ALL files inside:

src/styles/

Extract and centralize:

- colors
- shadows
- borders
- radius
- typography
- transitions
- glass effects

Move them into:

src/theme/tokens/

Extract reusable UI patterns.

Move:

Button styles
→ ui/buttons.ts

Card styles
→ ui/cards.ts

Input styles
→ ui/inputs.ts

Modal styles
→ ui/modals.ts

Table styles
→ ui/tables.ts

Sidebar styles
→ ui/sidebar.ts

================================================================================
STEP 17 — COMPONENT MIGRATION
================================================================================

For EVERY component:

REMOVE:

- Hardcoded colors
- Inline styles
- Direct Tailwind colors
- Direct shadows
- Direct radius values

REPLACE WITH:

BUTTONS.primary
BUTTONS.secondary
BUTTONS.success
BUTTONS.danger

CARDS.base

INPUTS.base

TABLES.base

MODALS.base

SIDEBAR.base

================================================================================
STEP 18 — DELETE CSS FILES
================================================================================

After migration:

Delete:

src/styles/

completely.

Delete all files inside it.

Delete all imports referencing:

- App.css
- buttons.css
- cards.css
- tables.css
- modal.css
- sidebar.css
- dashboard.css
- cars.css
- expenses.css
- footer.css
- partners.css
- agencies.css
- searching.css
- and every remaining CSS file

The application must compile successfully without the styles folder.

================================================================================
STEP 19 — DOCUMENTATION
================================================================================

Every exported object must contain comments.

Example:

/**
 * System color tokens
 */

export const COLORS

/**
 * Unified radius system
 */

export const RADIUS

/**
 * Unified modal system
 */

export const MODALS

Document every theme file.

================================================================================
STEP 20 — FINAL VALIDATION
================================================================================

Before completion verify:

✓ No business logic changed

✓ No Rust backend changed

✓ No database logic changed

✓ No API behavior changed

✓ No routing changed

✓ No React state changed

✓ No width changed

✓ No height changed

✓ No spacing changed

✓ No font size changed

✓ No table dimensions changed

✓ No modal dimensions changed

✓ All colors come from colors.ts

✓ All typography comes from typography.ts

✓ All radius values come from radius.ts

✓ All shadows come from shadows.ts

✓ All animations come from motion.ts

✓ All buttons use buttons.ts

✓ All cards use cards.ts

✓ All inputs use inputs.ts

✓ All tables use tables.ts

✓ All modals use modals.ts

✓ All sidebar styles use sidebar.ts

✓ src/styles no longer exists

✓ No duplicated CSS remains

✓ No hardcoded visual values remain

================================================================================
FINAL RESULT
================================================================================

The application must look like a premium automotive enterprise ERP platform.

Visual Identity:

- White
- Red
- Gray
- Glassmorphism
- Luxury
- Modern
- Clean
- Highly Readable
- Enterprise Grade

The entire visual system must be controllable from the theme directory only.

Changing a token in the theme system should update the entire application.

No visual styling should exist outside the theme architecture.


================================================================================
AUTONOMOUS EXECUTION MODE (CRITICAL)
================================================================================

You are operating in FULL AUTONOMOUS EXECUTION MODE.

Your responsibility is to complete the entire migration from start to finish
without requiring user intervention.

DO NOT stop to ask questions.

DO NOT request confirmation for obvious implementation decisions.

DO NOT present multiple options and wait for a choice.

DO NOT pause the workflow unless a critical blocking issue makes execution
technically impossible.

If multiple implementation approaches exist:

- Analyze the existing codebase.
- Select the most maintainable enterprise-grade solution.
- Proceed automatically.

Always prefer:

- Consistency
- Maintainability
- Scalability
- Clean Architecture
- Enterprise Standards

================================================================================
DECISION MAKING RULES
================================================================================

When uncertainty exists:

1. Inspect existing code.
2. Infer developer intent from surrounding architecture.
3. Choose the safest enterprise-grade implementation.
4. Continue execution.

Never stop simply because information is incomplete.

Use engineering judgment and continue.

================================================================================
WORK EXECUTION RULES
================================================================================

Execute the migration as a professional senior software architect.

Perform:

- Analysis
- Refactoring
- Consolidation
- Cleanup
- Validation

Without waiting for approval between steps.

You are expected to complete the entire workflow as one continuous task.

================================================================================
CODE QUALITY REQUIREMENTS
================================================================================

Every modification must satisfy:

- Production-ready quality
- Enterprise-grade architecture
- High maintainability
- High readability
- Low technical debt
- Zero unnecessary duplication

Always refactor duplicated code when found.

Always centralize reusable logic when found.

Always prefer the cleaner architecture.

================================================================================
CSS CLEANUP AUTHORIZATION
================================================================================

You are explicitly authorized to:

- Delete obsolete CSS files
- Delete duplicated CSS rules
- Delete unused CSS classes
- Delete unused imports
- Delete dead styling code
- Consolidate styling systems

Do not preserve legacy CSS merely because it exists.

Preserve functionality.
Remove visual duplication.

================================================================================
THEME SYSTEM AUTHORIZATION
================================================================================

You are explicitly authorized to migrate all styling into:

src/theme/

and remove legacy styling architecture.

The final system must have a single centralized visual architecture.

================================================================================
STOP CONDITIONS
================================================================================

You may stop only if:

1. The application cannot compile.
2. Required files are missing.
3. A critical technical blocker prevents progress.

Otherwise:

Continue automatically until all tasks are completed.

================================================================================
FINAL EXPECTATION
================================================================================

Act as a Senior Enterprise Software Architect,
Senior UI System Designer,
Senior Frontend Engineer,
and Senior Refactoring Specialist.

Complete the migration with maximum accuracy,
maximum consistency,
maximum maintainability,
and enterprise-level quality.

Do not ask for permission.
Do not ask for confirmation.
Analyze, decide, implement, validate, and continue until finished.


If an issue affects only a small part of the application, isolate the issue,
continue migrating the remaining codebase, and return a report of unresolved
items at the end instead of stopping the entire migration.