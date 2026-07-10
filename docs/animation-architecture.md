# Calcifer graph hero

## Rendering

The section is statically rendered by Astro. The heading, description, actions and technology labels are present in the first HTML response. The animated canvas is decorative and does not contain SEO-critical content.

The graph is borderless and covers the full hero section. The initial desktop camera places the demon on the right, while the canvas and pointer coordinate system continue across the whole section so a dragged node can stretch the graph far beyond its resting silhouette.

The graph uses two Three.js draw calls:

- `THREE.Points` with a custom shader for every body, face and spark node;
- `THREE.LineSegments` for every connection.

No post-processing pass is used. Soft glow is calculated inside the point fragment shader, which avoids an additional framebuffer and reduces GPU cost on laptops and mobile devices.

## Shape generation

The silhouette is generated deterministically from a seeded pseudo-random function. The body combines a broad rounded base, shoulders and five tapered flame tongues. The tall central tongue and raised side arms define the reference pose.

The face is generated as explicit graph structures:

- two large luminous eyes with outer rings, inner rings and dense fill nodes;
- dark pupil rings that preserve clear black centers;
- a wide open mouth with separate upper and lower contours plus red interior particles.

Body points are excluded from the eye and mouth voids so the expression remains readable at every quality level. Larger hub nodes are distributed through the body to reproduce the visual hierarchy of an Obsidian graph.

Ambient fire uses two spark systems:

- radial starburst clusters with a larger hub and connected satellites;
- paired embers distributed around the silhouette.

Every generated node has at least one connection. The main body uses local nearest-neighbour edges, facial structures use stronger internal springs and selected face nodes attach back to the flame body.

## Physics

Every node stores its current position, velocity and immutable target position. Each frame applies:

1. spring forces along graph edges;
2. a target-anchor force that preserves the silhouette;
3. velocity damping;
4. role-aware idle convection;
5. rendering-time flame and spark drift.

Flame and arm nodes move with layered slow and fast waves. Spark nodes use a wider, softer movement range. Eyes, pupils and mouth nodes stay comparatively stable so the expression does not dissolve.

While a node is dragged, its target anchor is weakened for connected nodes up to five graph steps away. Influence decays by graph distance. The selected node follows the pointer directly, while its neighbours follow through the spring network. After release, target anchors restore the original silhouette.

## Torch reveal

Six columns of small code cover the entire hero background in two DOM layers. The ambient layer remains barely visible across the section. The lit layer sits behind the WebGL graph and uses a radial CSS mask controlled by custom properties.

Dragging a node updates the mask position, radius and opacity. Pointer speed increases both brightness and illuminated area, producing a torch-like reveal without rendering code into WebGL. Releasing the node fades the lit code back into darkness.

## Loading and fallbacks

The first render displays an inline SVG graph generated from the same deterministic model. Three.js is code-split and loaded after browser idle time or the first pointer interaction.

The implementation also:

- caps device pixel ratio;
- reduces the source node count for coarse pointers and small viewports;
- uses a responsive off-centre camera on desktop and a lower camera composition on narrow screens;
- pauses animation when the document is hidden;
- disposes GPU resources on disconnect;
- preserves the SVG fallback after WebGL context failure;
- keeps the static SVG when `prefers-reduced-motion: reduce` is enabled.
