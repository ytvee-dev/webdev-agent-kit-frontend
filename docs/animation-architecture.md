# Calcifer graph hero

## Rendering

The section is statically rendered by Astro. The heading, description, actions and technology labels are present in the first HTML response. The animated canvas is decorative and does not contain SEO-critical content.

The graph uses two Three.js draw calls:

- `THREE.Points` with a custom shader for every node;
- `THREE.LineSegments` for every connection.

No post-processing pass is used. Soft glow is calculated inside the point fragment shader, which avoids an additional framebuffer and reduces GPU cost on laptops and mobile devices.

## Shape generation

The flame body is generated deterministically from a seeded pseudo-random function. Points are accepted inside a union of a rounded body and five tapered flame tongues. Arms, eyes, pupils and the mouth are generated from explicit curves so the face remains readable at every quality level.

The graph connects flame points to nearby neighbours. Face rings and mouth curves have stronger internal springs. Each facial group is also attached to nearby flame nodes.

## Physics

Every node stores its current position, velocity and immutable target position. Each frame applies:

1. spring forces along graph edges;
2. a target-anchor force that preserves the silhouette;
3. velocity damping;
4. a very small role-aware idle drift.

While a node is dragged, its target anchor is weakened for connected nodes up to four graph steps away. Influence decays by graph distance. The selected node follows the pointer directly, while its neighbours follow through the spring network. After release, target anchors restore the original silhouette.

## Torch reveal

The code wall is a DOM layer behind the canvas. It remains transparent until a node is dragged. Pointer position updates CSS custom properties that control a radial mask. Pointer speed controls opacity, producing a torch-like reveal without rendering code into WebGL.

## Loading and fallbacks

The first render displays an inline SVG graph generated from the same deterministic model. Three.js is code-split and loaded after browser idle time or the first pointer interaction.

The implementation also:

- caps device pixel ratio;
- reduces node count for coarse pointers and small viewports;
- pauses animation when the document is hidden;
- disposes GPU resources on disconnect;
- preserves the SVG fallback after WebGL context failure;
- keeps the static SVG when `prefers-reduced-motion: reduce` is enabled.
