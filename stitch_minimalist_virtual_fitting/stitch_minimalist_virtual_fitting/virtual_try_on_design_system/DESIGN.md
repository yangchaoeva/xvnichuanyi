---
name: Virtual Try-on Design System
colors:
  surface: '#fcf8fb'
  surface-dim: '#dcd9dc'
  surface-bright: '#fcf8fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7ea'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#414753'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#727784'
  outline-variant: '#c1c6d5'
  surface-tint: '#005cba'
  primary: '#004e9f'
  on-primary: '#ffffff'
  primary-container: '#0066cc'
  on-primary-container: '#dfe8ff'
  inverse-primary: '#aac7ff'
  secondary: '#5e5e63'
  on-secondary: '#ffffff'
  secondary-container: '#e0dfe4'
  on-secondary-container: '#626267'
  tertiary: '#4e5052'
  on-tertiary: '#ffffff'
  tertiary-container: '#67686a'
  on-tertiary-container: '#e8e8ea'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e3ff'
  primary-fixed-dim: '#aac7ff'
  on-primary-fixed: '#001b3e'
  on-primary-fixed-variant: '#00458e'
  secondary-fixed: '#e3e2e7'
  secondary-fixed-dim: '#c7c6cb'
  on-secondary-fixed: '#1a1b1f'
  on-secondary-fixed-variant: '#46464b'
  tertiary-fixed: '#e2e2e4'
  tertiary-fixed-dim: '#c6c6c8'
  on-tertiary-fixed: '#1a1c1d'
  on-tertiary-fixed-variant: '#454749'
  background: '#fcf8fb'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-large:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-main:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  label-bold:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-subtle:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: '0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max-width: 1200px
  gutter: 24px
  margin-page: 40px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  section-padding: 24px
---

## Brand & Style

The design system is anchored in high-end minimalism, specifically tailored for a premium "Virtual Try-on" desktop experience. It targets a fashion-forward, tech-savvy audience that values clarity, efficiency, and aesthetic sophistication. The UI evokes a sense of calm and precision, mirroring the experience of a luxury retail fitting room.

The visual style is a blend of **Modern Corporate** and **Minimalism**. It prioritizes content—specifically high-fidelity imagery of people and clothing—by utilizing vast amounts of white space and a restrained color palette. The interface feels lightweight and responsive, using subtle depth cues rather than heavy decorative elements to guide the user through the complex AI-driven process of virtual fitting.

## Colors

The color strategy for this design system is strictly disciplined to ensure the user's focus remains on the uploaded garments and generated results. 

- **Primary:** An iconic accent blue (#0066cc) is reserved exclusively for primary action buttons, active states, and critical progress indicators.
- **Surface:** Pure white (#ffffff) is the base for all primary panels and the application background to maximize "airiness."
- **Neutral/Borders:** A soft, neutral gray (#f5f5f7) is used for structural borders and secondary background fills, creating a "tonal layer" effect without adding visual weight.
- **Text:** High-contrast charcoal (#1d1d1f) is used for headings to ensure legibility, while a softer gray (#86868b) is used for secondary metadata and instructional hints.

## Typography

This design system utilizes **Inter** to achieve a clean, systematic appearance reminiscent of SF Pro. The typographic hierarchy is designed to be functional and unobtrusive.

Headlines use semi-bold weights with tight letter-spacing to feel authoritative and modern. Body text prioritizes a generous line-height to ensure instructional content is easily digestible. High-quality imagery is often paired with small, uppercase labels or subtle descriptors to maintain a "gallery" feel. All text elements should adhere to the charcoal and medium-gray color tokens to maintain the premium aesthetic.

## Layout & Spacing

The layout philosophy follows a **Fixed Grid** model centered on the desktop viewport, ensuring that the high-resolution image previews are always the focal point. 

- **Grid:** A 12-column grid with 24px gutters is used for internal component alignment.
- **Rhythm:** Spacing follows an 8px base unit. Section-to-section spacing is generous (32px+) to prevent the interface from feeling cluttered.
- **Canvas:** The main workspace is divided into three clear logical zones: the step-by-step navigation header, the dual-upload work area (Person and Garment), and the right-hand preview/results panel.
- **Margins:** Page margins are kept wide (40px) to provide a "frame" for the application content, reinforcing the premium software feel.

## Elevation & Depth

Hierarchy in this design system is primarily established through **Tonal Layers** and **Ambient Shadows**. 

1.  **Level 0 (Base):** The main application background is pure white.
2.  **Level 1 (Cards):** UI containers use a subtle #f5f5f7 border. Shadows at this level are almost imperceptible—very large blur radii (20px-30px) with extremely low opacity (3-5%) to create a soft lift from the page.
3.  **Level 2 (Popovers/Modals):** Elements that require immediate focus use a more defined ambient shadow and a 1px border.

The use of backdrop blurs (Glassmorphism) is encouraged for global navigation bars or "Processing" overlays to maintain a sense of context and depth.

## Shapes

The shape language is defined by **Soft Continuity**. To reflect the organic nature of fashion and the human form, all containers and interactive elements feature significantly rounded corners.

- **Standard Components:** Buttons, input fields, and small chips use a 12px radius.
- **Main Containers:** Large workflow cards and image preview areas use a 20px radius.
- **Visual Elements:** Image thumbnails should mirror the container's roundedness to create a nested, cohesive look.

Sharp 90-degree angles are avoided entirely to maintain the approachable, elegant character of the design system.

## Components

### Buttons
- **Primary:** Blue background (#0066cc), white text, 12px border-radius. Subtle hover state involves a slight darkening of the blue.
- **Secondary:** White background, subtle gray border (#f5f5f7), charcoal text.
- **Tertiary/Ghost:** No border, blue or gray text, used for less frequent actions like "Clear All."

### Step Navigation
A horizontal progress tracker at the top of the workspace. Steps are indicated by circled numbers (24px diameter). The active step uses the primary blue accent, while completed steps use a soft checkmark icon.

### Upload Cards
Large, airy containers with dashed borders (only for empty states) and centered icons. Once an image is uploaded, it should fill the container with a "cover" aspect ratio, maintaining the 20px corner radius.

### Input Fields & Controls
Minimalist styling with a 12px radius and a #f5f5f7 background. Focus states are indicated by a 2px primary blue border. Labels are always positioned above the field in the `label-bold` typographic style.

### Preview Panel
A dedicated right-aligned card for the "Generated Result." This should be the most elevated component on the page, featuring a slightly more prominent drop shadow to signify it as the final output of the user's workflow.