---
name: Serene Narrative
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#404943'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#707973'
  outline-variant: '#bfc9c1'
  surface-tint: '#2c694e'
  primary: '#0f5238'
  on-primary: '#ffffff'
  primary-container: '#2d6a4f'
  on-primary-container: '#a8e7c5'
  inverse-primary: '#95d4b3'
  secondary: '#2b6485'
  on-secondary: '#ffffff'
  secondary-container: '#a3d8fe'
  on-secondary-container: '#255f80'
  tertiary: '#1c4f51'
  on-tertiary: '#ffffff'
  tertiary-container: '#366769'
  on-tertiary-container: '#b1e3e5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b1f0ce'
  primary-fixed-dim: '#95d4b3'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#0e5138'
  secondary-fixed: '#c7e7ff'
  secondary-fixed-dim: '#98cdf2'
  on-secondary-fixed: '#001e2e'
  on-secondary-fixed-variant: '#064c6b'
  tertiary-fixed: '#b9ecee'
  tertiary-fixed-dim: '#9ecfd1'
  on-tertiary-fixed: '#002021'
  on-tertiary-fixed-variant: '#1a4e50'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  entry-text:
    fontFamily: Source Serif 4
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 32px
  ui-medium:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  label-sm:
    fontFamily: Manrope
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-padding-desktop: 40px
  container-padding-mobile: 20px
  gutter: 24px
  sidebar-width: 280px
  max-content-width: 800px
---

## Brand & Style

The design system is centered on the concept of "Digital Sanctuary." It targets individuals seeking a professional yet emotionally resonant space for daily reflection and long-form journaling. The aesthetic is a refined blend of **Minimalism** and **Modern Corporate** sensibilities, emphasizing cognitive ease and clarity.

The interface prioritizes a "content-first" hierarchy where UI elements recede into the background, allowing the user's thoughts to take center stage. The emotional response is one of tranquility, order, and intellectual focus. By utilizing generous whitespace and a sophisticated, cool-toned palette, the design system transforms the act of journaling into a premium, meditative experience.

## Colors

The color palette is inspired by natural landscapes—deep forest greens and serene coastal blues—set against a crisp, high-latitude white. 

- **Primary (Fresh Green):** Used for primary actions, success states, and active navigation markers to signify growth and vitality.
- **Secondary (Serene Blue):** Applied to secondary interactive elements and functional icons to maintain a professional, trustworthy tone.
- **Neutral Stack:** A range of ultra-light greys and off-whites are used for surface layering, ensuring the "Crisp White" background remains the dominant visual anchor for readability.
- **Text:** Deep navy is used instead of pure black to soften the contrast and reduce eye strain during long writing sessions.

## Typography

This design system utilizes a dual-font strategy to distinguish between the "System" and the "Soul" of the application.

- **UI Elements (Manrope):** A modern, geometric sans-serif used for navigation, buttons, and labels. It provides a structured, professional framework for the app.
- **Diary Entries (Source Serif 4):** A highly legible, authoritative serif font used for the actual journal content. The increased line height (32px) and generous font size (18px) mimic the experience of reading a well-set book, encouraging deep focus.
- **Scale:** Large displays use `display-lg` for date headers, while mobile transitions to `headline-md-mobile` to maintain balance on narrower viewports.

## Layout & Spacing

The layout follows a **Fixed-Fluid hybrid model**. 
- **Side Navigation:** A fixed 280px sidebar on desktop provides immediate access to the calendar and historical entries.
- **Content Area:** The writing canvas is centered with a `max-content-width` of 800px to prevent line lengths from becoming too long, which preserves readability.
- **Grid:** A 12-column grid is used for dashboard views, but the primary editor interface is a single-column "focus mode" layout.
- **Breakpoints:** 
    - **Mobile (<768px):** Sidebar collapses into a bottom sheet or hamburger menu. Padding reduces to 20px.
    - **Tablet (768px - 1024px):** Sidebar persists but can be toggled.
    - **Desktop (>1024px):** Wide margins are introduced to emphasize the minimal, spacious aesthetic.

## Elevation & Depth

To maintain a "clean and modern" look, this design system avoids heavy shadows in favor of **Tonal Layers** and **Low-Contrast Outlines**.

1.  **Level 0 (Base):** The main background uses `#FFFFFF`.
2.  **Level 1 (Navigation/Cards):** Surfaces like the sidebar or entry cards use the `neutral_color_hex` (#F8F9FA) with a subtle `1px` border in a slightly darker neutral tint.
3.  **Interactive Depth:** Only the active writing card or a focused modal receives a soft, ambient shadow (0px 4px 20px, 5% opacity of the primary color) to gently lift it above the canvas without breaking the minimalist aesthetic.
4.  **Glassmorphism:** A subtle backdrop blur (12px) is used exclusively for the editor's sticky formatting toolbar to maintain context of the text scrolling beneath it.

## Shapes

The shape language is **Soft (0.25rem)**. This choice maintains the professional "archival" feel of a traditional diary while feeling modern. 

- **Cards and Modals:** Use `rounded-lg` (0.5rem) to provide a gentle, approachable frame for content.
- **Buttons:** Small buttons use the base `0.25rem`, while the "New Entry" FAB (Floating Action Button) may use a full pill shape to distinguish it as the primary call to action.
- **Inputs:** Text fields use sharp-cornered bottoms with subtle 2px bottom borders to mimic lined stationery.

## Components

- **Rich-Text Editor:** A borderless interface where the only UI is a floating, semi-transparent toolbar. The toolbar should appear only on text selection or hover to minimize distraction.
- **Entry Cards:** Used in the archive view. They feature a `headline-md` date, a 3-line snippet in `entry-text`, and a small color-coded chip representing the "mood" or "tag" of the day.
- **Side Navigation:** Uses a vertical list with high "active" contrast. The active date is marked with a `primary_color_hex` vertical bar on the left.
- **Buttons:**
    - **Primary:** Solid `primary_color_hex` with white text.
    - **Secondary:** Ghost style (outline only) using `secondary_color_hex`.
- **Chips:** Highly rounded (pill-shaped) with low-saturation background tints (`accent_green_light`) and darker text for categorized journaling (e.g., #Work, #Gratitude).
- **Date Picker:** A minimalist calendar view integrated directly into the sidebar, using subtle typography and avoiding heavy grids.