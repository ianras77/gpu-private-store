# UX brand system

All five products share chart calculation, report semantics, navigation information architecture, and accessibility behavior. They differ through a typed experience system: archetype, mood, tagline, hero geometry, surface treatment, chapter language, motion pace, and navigation treatment.

| Brand | World | Hero | Surface | Motion |
| --- | --- | --- | --- | --- |
| Jupiterseek | Celestial atlas | Expanding orbit | Atmospheric | Expansive |
| Saturnseer | Architectural observatory | Drafting compass/ring | Architectural | Measured |
| Saturn Leo | Solar editorial | Stage and solar disc | Editorial | Spotlight |
| Malefic Me | Alchemical brutalism | Fractured orb | Hard contrast | Controlled snap |
| Oracle Veil | Lunar manuscript | Veil and threshold | Layered planes | Mask/reveal |

The shared components live in `packages/web-experience`; deployable apps provide only brand identity and route metadata. Marks are CSS geometry and remain legible without raster assets. Every motion treatment has a reduced-motion mode.
