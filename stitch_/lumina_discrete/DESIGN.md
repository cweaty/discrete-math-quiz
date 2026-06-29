---
name: Lumina Discrete
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#464555'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#4953bc'
  on-secondary: '#ffffff'
  secondary-container: '#8792fe'
  on-secondary-container: '#17228f'
  tertiary: '#45484f'
  on-tertiary: '#ffffff'
  tertiary-container: '#5d6067'
  on-tertiary-container: '#d9dbe3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#e0e0ff'
  secondary-fixed-dim: '#bdc2ff'
  on-secondary-fixed: '#000767'
  on-secondary-fixed-variant: '#2f3aa3'
  tertiary-fixed: '#e0e2ea'
  tertiary-fixed-dim: '#c4c6ce'
  on-tertiary-fixed: '#181c21'
  on-tertiary-fixed-variant: '#43474d'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  math-display:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-padding: 20px
  stack-gap: 16px
  inline-gap: 12px
  section-margin: 32px
  glass-padding: 16px
---

## Brand & Style
The design system focuses on cognitive clarity and academic focus for students of discrete mathematics. The brand personality is intellectual, precise, yet approachable, moving away from the intimidating nature of traditional textbooks. 

The aesthetic is a sophisticated blend of **Modern Flat** and **Glassmorphism**. High-density mathematical data is organized through translucent layers that provide depth without visual clutter. The interface should feel like a premium digital workspace—breathable, calm, and highly structured. The target audience is university students who require a tool that feels fast, reliable, and modern.

## Colors
The palette utilizes a soft HSL-based approach to reduce eye strain during long study sessions. 
- **Primary Indigo (#4f46e5):** Used for primary actions, active states, and emphasis on mathematical proofs.
- **Surface Lavender:** Backgrounds use a very light tint of lavender-blue (#f8faff) instead of pure white to soften the contrast.
- **Neutrals:** Pure black is replaced with a deep Slate (#1e293b) for text to maintain a professional, high-end feel.
- **Semantic Colors:** Success (emerald), Error (rose), and Warning (amber) should be desaturated to fit the soft aesthetic.

## Typography
The system uses **Inter** for its exceptional legibility in technical and mathematical contexts. 
- **Hierarchy:** Use weight (SemiBold/Bold) rather than extreme size shifts to differentiate sections.
- **Chinese Typesetting:** Ensure a fallback to system sans-serif (PingFang SC) with a line-height multiplier of 1.5x for body text to ensure readability of complex characters.
- **Math Expressions:** Mathematical symbols and variables should be rendered with slightly increased tracking and a medium weight to distinguish them from standard prose.

## Layout & Spacing
As a mobile-first system, this design system employs a **fluid-width layout** with fixed horizontal margins.
- **Margins:** A consistent 20px safe area on the left and right edges of the screen.
- **Vertical Rhythm:** Elements are stacked using a 4px-based grid. Cards and interactive modules should be separated by 16px to maintain an airy, "Modern Flat" feel.
- **Bottom Navigation:** A fixed height of 84px (including home indicator area) with 5 equally spaced icons.

## Elevation & Depth
Depth is created through **Glassmorphism** rather than traditional heavy shadows.
- **Glass Containers:** Use `backdrop-filter: blur(12px)` combined with a 1px border of `rgba(255, 255, 255, 0.4)` to simulate a frosted glass pane.
- **Tonal Elevation:** Instead of lifting elements with shadows, use subtle color shifts. A "raised" element should be a lighter shade of the surface color or a more opaque glass layer.
- **Shadows:** Use only one "soft" shadow for the primary floating action buttons: `0 8px 30px rgba(79, 70, 229, 0.15)`.

## Shapes
The shape language is friendly and ergonomic, defined by generous corner radii.
- **Small Components (Chips/Badges):** 8px radius.
- **Standard Components (Inputs/Small Buttons):** 12px radius.
- **Containers (Cards/Glass Panes):** 16px to 24px radius, creating a "squircle" aesthetic that feels comfortable for handheld use.
- **Bottom Bar:** Top-left and top-right corners should have a 24px radius to create a distinct "dock" appearance.

## Components
- **Buttons:** Primary buttons use a solid Indigo fill. Secondary buttons use a glass effect with an indigo border. All buttons must have a minimum height of 48px for touch targets.
- **Glass Cards:** The primary container for math problems. Use a white-translucent background with a soft inner glow.
- **Bottom Navigation:** Uses **Material Symbols Rounded**. The active tab uses a filled icon with a small indigo dot indicator underneath; inactive tabs use linear (outline) versions in a muted slate-gray.
- **Chips:** For tags like "Graph Theory" or "Set Theory," use high-rounded pill shapes with 10% opacity primary color fills.
- **Input Fields:** Soft blue-gray background with a 1px border that glows indigo on focus.
- **Progress Ring:** For "Exam" and "Ranking" sections, use a stroke-based circular progress indicator with a subtle gradient (Indigo to Violet).
- **Micro-interactions:** When a user selects a multiple-choice option, the card should scale slightly (0.98) and the border should pulse with the primary color.