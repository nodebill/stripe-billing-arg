# Notion-style UI Redesign for Pentos

## Context

Pentos is an Argentine billing engine with an admin console built on Next.js, Tailwind CSS v4, Base UI React, and shadcn components. The current UI uses Geist fonts, OKLch color tokens with light/dark mode, and a top horizontal navbar. The goal is a full visual redesign to match Notion's design language: warm neutrals, Inter font, whisper borders, subtle multi-layer shadows, and a sidebar navigation layout. Dark mode is being dropped.

The design reference is `DESIGN.md` (Notion style guide via `getdesign`).

## 1. Theme Foundation (globals.css)

### Color Tokens

Replace OKLch values with Notion's warm palette. Remove the `.dark` block and `@custom-variant dark` line entirely.

| Token | New Value | Notion Role |
|-------|-----------|-------------|
| `--background` | `#ffffff` | Page background |
| `--foreground` | `rgba(0,0,0,0.95)` | Near-black primary text |
| `--card` | `#ffffff` | Card surface |
| `--card-foreground` | `rgba(0,0,0,0.95)` | Card text |
| `--popover` | `#ffffff` | Popover surface |
| `--popover-foreground` | `rgba(0,0,0,0.95)` | Popover text |
| `--primary` | `#0075de` | Notion Blue (CTAs, links) |
| `--primary-foreground` | `#ffffff` | Text on primary |
| `--secondary` | `rgba(0,0,0,0.05)` | Secondary button background |
| `--secondary-foreground` | `rgba(0,0,0,0.95)` | Secondary button text |
| `--muted` | `#f6f5f4` | Warm white surfaces |
| `--muted-foreground` | `#615d59` | Warm gray secondary text |
| `--accent` | `#f6f5f4` | Accent surfaces |
| `--accent-foreground` | `rgba(0,0,0,0.95)` | Accent text |
| `--destructive` | `#dd5b00` | Warning/destructive (Notion orange) |
| `--border` | `rgba(0,0,0,0.1)` | Whisper border |
| `--input` | `#dddddd` | Input border |
| `--ring` | `#097fe8` | Focus ring (Focus Blue) |

Sidebar tokens: `--sidebar: #f6f5f4`, `--sidebar-foreground: rgba(0,0,0,0.95)`, `--sidebar-primary: #0075de`, `--sidebar-primary-foreground: #ffffff`, `--sidebar-accent: rgba(0,0,0,0.05)`, `--sidebar-accent-foreground: rgba(0,0,0,0.95)`, `--sidebar-border: rgba(0,0,0,0.1)`, `--sidebar-ring: #097fe8`.

Chart tokens: `--chart-1: #0075de`, `--chart-2: #2a9d99`, `--chart-3: #dd5b00`, `--chart-4: #ff64c8`, `--chart-5: #391c57`.

### Radius

Change `--radius` from `0.625rem` to `0.25rem` (4px base). Cards use explicit `rounded-xl` (12px).

### Font

Swap Geist to Inter via `next/font/google`. Set `--font-sans` to the Inter CSS variable. Remove Geist_Mono; set `--font-mono` to `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`.

### Shadows (as CSS custom properties)

```css
--shadow-card: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px;
--shadow-deep: rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px;
```

### Files to modify

- `app/globals.css`
- `app/layout.tsx` (font swap)

## 2. Sidebar Layout

### Structure

Replace the top navbar in `app/(protected)/layout.tsx` with a sidebar:

- Fixed sidebar, 240px wide, `#f6f5f4` background, full viewport height
- **Header:** "Pentos" brand, Inter 16px weight 700
- **Nav links:** Stacked vertically with lucide icons, 15px weight 500, near-black text
- **Active state:** `rgba(0,0,0,0.05)` background, 4px radius
- **Hover:** Same subtle background
- **Admin section:** Separated by a whisper-border `<Separator />`
- **User info + sign-out:** Pinned at bottom of sidebar
- **Main content:** Fills remaining width, white background

### Responsive

- Below 768px: sidebar collapses, hamburger toggle button appears
- Sidebar overlays content when open on mobile

### Auth layout

- `app/(auth)/layout.tsx`: Replace sky-blue gradient with `#f6f5f4` background
- Card: white, whisper border, 12px radius, `--shadow-card`

### Files to modify

- `app/(protected)/layout.tsx` (full rewrite)
- `app/(auth)/layout.tsx` (restyle)

## 3. Component Restyling

All components in `components/ui/`. Strip all `dark:` prefixed classes from every component.

### Button (`button.tsx`)

- **Primary:** `#0075de` bg, white text, 4px radius, padding `8px 16px`, hover `#005bab`, active `scale(0.9)`
- **Secondary:** `rgba(0,0,0,0.05)` bg, near-black text, hover scale(1.05), active scale(0.9)
- **Ghost:** Transparent, near-black text, underline on hover
- **Destructive:** `#dd5b00` tinted bg/text
- **Link:** `#0075de` text, underline on hover
- **Focus:** `2px solid #097fe8` outline

### Card (`card.tsx`)

- White bg, `1px solid rgba(0,0,0,0.1)` border, 12px radius
- Shadow: `--shadow-card`
- Title: weight 700, letter-spacing -0.25px
- Replace `ring-1 ring-foreground/10` with explicit border

### Badge (`badge.tsx`)

- Default: `#f2f9ff` bg, `#097fe8` text (Notion blue pill)
- 12px font, weight 600, letter-spacing 0.125px, 9999px radius
- Status variants: teal (`#2a9d99`) for active, warm gray for inactive

### Input (`input.tsx`) / Textarea (`textarea.tsx`)

- White bg, `#dddddd` border, 4px radius
- Focus: blue ring (`#097fe8`)
- Placeholder: `#a39e98`

### Dialog (`dialog.tsx`)

- White bg, 12px radius, `--shadow-deep`
- Overlay: `rgba(0,0,0,0.1)` backdrop

### Table (`table.tsx`)

- Whisper borders between rows
- Header: weight 600, `#615d59` text
- Row hover: `#f6f5f4`

### Popover (`popover.tsx`)

- White bg, whisper border, 8px radius, `--shadow-card`

### Other components

- **Switch:** Keep rounded-full, checked color `#0075de`
- **Tooltip:** `rgba(0,0,0,0.95)` bg, white text, 4px radius
- **Command:** White bg, whisper border, 12px radius
- **Separator:** `rgba(0,0,0,0.1)` color
- **Label:** weight 500, near-black
- **InputGroup:** Same border/radius as Input

### Files to modify

All files in `components/ui/`:
- `button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`
- `dialog.tsx`, `table.tsx`, `popover.tsx`, `switch.tsx`, `tooltip.tsx`
- `command.tsx`, `separator.tsx`, `label.tsx`, `input-group.tsx`

## 4. Page-level Updates

### Page headers (all *-view.tsx files)

- Title: 26px (1.63rem), weight 700, letter-spacing -0.625px
- Subtitle: 16px weight 400, `#615d59`
- Count: Notion pill badge (`#f2f9ff` bg, `#097fe8` text) instead of inline text

### Toolbar areas

- Search input with `#a39e98` placeholder
- Primary action buttons in Notion Blue

### Empty states

- Solid whisper border (not dashed)
- Icon circle: `#f6f5f4` background

### Code snippets

- `<code>` tags: `#f6f5f4` background, 4px radius

### Files to modify

- `app/(protected)/products/_components/products-view.tsx`
- `app/(protected)/products/[id]/_components/product-detail-view.tsx`
- `app/(protected)/customers/_components/customers-view.tsx`
- `app/(protected)/customers/[id]/_components/customer-detail-view.tsx`
- `app/(protected)/billing/subscriptions/_components/subscriptions-view.tsx`
- `app/(protected)/billing/invoices/_components/invoices-view.tsx`
- `app/(protected)/billing/meters/_components/meters-view.tsx`
- `app/(protected)/billing/meters/[id]/_components/meter-detail-view.tsx`
- `app/(protected)/team/page.tsx` (or its view component)
- `app/(protected)/api-keys/page.tsx` (or its view component)
- All `*-dialog.tsx` files (inherit component changes, may need minor class updates)

## 5. Typography System

Apply Notion's typography hierarchy via Tailwind utility classes:

| Role | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| Page title | 26px (text-[1.63rem]) | 700 | 1.23 | -0.625px |
| Card title | 22px (text-[1.38rem]) | 700 | 1.27 | -0.25px |
| Body large | 20px (text-xl) | 600 | 1.40 | -0.125px |
| Body | 16px (text-base) | 400 | 1.50 | normal |
| Nav/Button | 15px (text-[0.94rem]) | 600 | 1.33 | normal |
| Caption | 14px (text-sm) | 500 | 1.43 | normal |
| Badge | 12px (text-xs) | 600 | 1.33 | 0.125px |

## Verification

1. Run `npm run dev` and check all pages render without errors
2. Verify sidebar navigation works on desktop and collapses on mobile
3. Confirm all interactive states: button hover/active/focus, input focus, link hover
4. Check whisper borders and card shadows are visible but subtle
5. Verify auth pages (sign-in, bootstrap, accept-invite) have warm white background
6. Confirm no dark mode artifacts remain (no `.dark` classes, no `dark:` utilities)
7. Test all dialogs open/close with updated styling
8. Verify badge pill shapes on status indicators (products, subscriptions)
