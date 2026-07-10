# Reference-matched fire demon hero

## Rendering

The section is statically rendered by Astro. The heading, description, actions and technology labels are present in the first HTML response. The animated canvas is decorative and does not contain SEO-critical content.

The graph is borderless and covers the full hero section. The initial desktop camera places the demon on the right, while the canvas and pointer coordinate system continue across the whole section so a dragged node can stretch the graph through the complete hero field.

The graph uses two Three.js draw calls:

- `THREE.Points` with a custom shader for all body, contour, face and detached fire nodes;
- `THREE.LineSegments` for all graph connections.

No post-processing pass is used. The point fragment shader renders a hard luminous core, a softer inner core and a role-controlled halo. This keeps the glow expressive without adding an extra framebuffer or bloom pipeline.

## Reference-derived silhouette

The main body no longer depends only on primitive ellipses. A compact 72 × 72 density field was derived from the supplied warm reference and stored as numeric rows in `referenceMask.ts`. The runtime samples that field with bilinear interpolation.

The density field controls:

- the accepted body positions;
- higher concentration around the face and lower core;
- sparse crown tips and side flames;
- the wide rounded lower body;
- the raised side-arm silhouette;
- contour detection through local density gradients.

The generator adds separate graph layers on top of the mask:

- dense body particles;
- a stronger contour/rim layer;
- explicit raised arm chains with surrounding micro-particles;
- two large eye structures with outer rings, inner rings, bright fill and compact black pupils;
- a wide open mouth with upper and lower contours, a dark red interior and a brighter lower tongue arc;
- large hub nodes distributed among much smaller particles;
- detached starburst clusters and paired drifting embers.

Body points are excluded from eye and mouth voids so the expression remains readable. Every node is connected, but detached spark groups are allowed to remain separate visual components.

## Fire colour and scale

Colour is calculated from height, distance from the hot core and local mask density. The palette moves through:

1. cream and yellow in the dense lower core;
2. amber and orange;
3. red and crimson;
4. magenta and violet at cooler outer tips;
5. occasional blue on the highest or most distant particles.

Node diameters vary by role and probability. The graph combines many micro-nodes with sparse large hubs, large black pupil nodes, bright eye particles and medium starburst centres.

## Physics and idle combustion

Every node stores its current position, velocity and immutable target position. Each frame applies:

1. spring forces along graph edges;
2. a target-anchor force preserving the reference silhouette;
3. velocity damping;
4. role-aware lateral turbulence and upward convection;
5. rendering-time thermal waves, flicker and size pulses.

Flame, rim and arm nodes use layered slow, medium and fast waves. Starburst and ember nodes have wider orbital and upward drift. Eye, pupil and mouth nodes stay comparatively stable so the face does not dissolve.

While a node is dragged, target anchors are weakened for connected nodes up to seven graph steps away. Influence decays by graph distance. This permits large full-section deformation while still allowing the demon to recover after release.

## Torch code reveal

Twelve narrow code columns cover the full hero in two DOM layers. Text is deliberately very small and dense.

- The ambient layer remains almost invisible across the section.
- The lit layer sits behind the WebGL canvas.
- A radial CSS mask follows the dragged node and pointer.
- Pointer speed increases mask radius, code opacity and the warm background haze.
- Releasing the node fades the code and haze back into darkness.

The code remains real DOM text rather than being painted into WebGL, preserving rendering simplicity and keeping it visually behind the graph.

## Loading and fallbacks

The first render displays an inline SVG graph generated from the same deterministic model. Three.js is code-split and loaded after browser idle time or the first pointer interaction.

The implementation also:

- caps device pixel ratio;
- uses adaptive source density for mobile, tablet and desktop;
- uses a responsive off-centre camera on desktop and a lower camera composition on narrow screens;
- pauses animation when the document is hidden;
- disposes GPU resources on disconnect;
- preserves the SVG fallback after WebGL context failure;
- keeps the static SVG when `prefers-reduced-motion: reduce` is enabled.
