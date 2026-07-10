# Fire-demon face, combustion and torch interaction

## Rendering model

The hero remains statically rendered by Astro. The heading, description, actions and technology labels are present in the first HTML response. The WebGL graph is decorative and contains no SEO-critical content.

The graph is borderless and occupies the complete hero section. Its resting composition is offset to the right on desktop, while the canvas and pointer coordinate system cover the entire section so any node can be dragged far beyond the initial silhouette.

Three.js still renders the complete character with two draw calls:

- `THREE.Points` for body, contour, face, sparks and embers;
- `THREE.LineSegments` for all graph connections.

No post-processing framebuffer is used. A custom point shader provides a hard particle core, a soft inner core and feature-controlled glow.

## Reference-derived body

The principal silhouette is sampled from the compact density field in `referenceMask.ts`. Density controls particle acceptance, concentration and colour. Local density gradients create a stronger contour layer around the rounded lower body, side flames, raised arms and crown tongues.

The generator overlays explicit structures for:

- body and contour particles;
- raised arm chains and surrounding micro-particles;
- sparse large Obsidian-style hubs;
- detached starburst clusters;
- paired embers drifting around the silhouette.

## Face feature metadata

`GraphNodeSeed` may carry a `feature` value. The renderer uses this metadata to animate and illuminate facial layers differently without creating additional materials or draw calls.

Eye features:

- `eye-outer-rim`;
- `eye-sclera`;
- `eye-iris`;
- `eye-highlight`;
- `eye-pupil`.

Mouth features:

- `mouth-outer-rim`;
- `mouth-inner-rim`;
- `mouth-cavity`;
- `mouth-tongue`;
- `mouth-highlight`.

## Eye construction

The eyes are deliberately asymmetric. The left eye is slightly larger and the two pupils have opposite horizontal offsets, matching the irregular character of the references.

Each eye contains:

1. an irregular warm outer ring;
2. a second bright structural ring;
3. hundreds of cream and white micro-particles sampled within an annulus;
4. a compact iris ring;
5. a black pupil ring, central hub and dark fill particles;
6. radial iris-to-pupil spokes;
7. a small upper-left highlight cluster.

The outer, middle, iris and pupil rings use stronger local springs. Selected outer-ring nodes attach the complete eye to the surrounding flame. This keeps the eyes readable while the rest of the graph stretches.

At render time, the two pupils share a slow, subtle gaze displacement. Sclera and iris particles twinkle independently, while highlight particles receive stronger glow and size pulses. Pupil particles remain black and do not receive bloom-like halos.

## Mouth construction

The mouth is a broad raised-corner smile composed from four structural curves:

- outer upper lip;
- outer lower lip;
- inner upper lip;
- inner lower lip.

The lower curves are deepened by `createPresentationGraph.ts`, after which all affected edge rest lengths are recalculated. This produces a deeper rounded opening without modifying the reusable body generator.

Inside the contours:

- only a small number of nearly black cavity particles are used so the opening remains visibly dark;
- a dense red-orange tongue bed occupies the lower third;
- a bright tongue arc defines the upper tongue edge;
- additional lip highlights follow both contours;
- larger corner nodes reinforce the raised smile.

Mouth cavity particles have almost no glow. Tongue and highlight particles pulse separately from the lips, preserving the reference's dark opening and illuminated lower interior.

## Idle combustion

Physics preserves the reference pose through target anchors and graph springs. Rendering adds a second visual combustion layer that does not alter edge rest lengths.

The animation combines:

- slow, medium and fast particle flicker;
- two upward travelling thermal bands;
- height-dependent lateral turbulence;
- rising and orbiting detached embers;
- feature-aware size breathing;
- dynamic per-node glow;
- travelling brightness pulses along graph edges.

Body, contour and arm particles move most like continuous fire. Sparks and embers have wider motion. Facial structures remain strongly anchored, but eye highlights, iris particles and the tongue receive controlled local animation so the face feels alive rather than rigid.

## Drag interaction

The selected node follows the pointer directly. Connected nodes react through the spring network, and drag influence propagates up to seven graph steps with exponential decay. Target anchors weaken under this influence, allowing the demon to stretch through the full hero field.

After release, the original anchors recover the reference silhouette. Eye and mouth structures use stronger internal springs so they deform coherently instead of disintegrating into unrelated particles.

## Code wall and torch reveal

The background contains eighteen very narrow code columns. Each column combines two source fragments, producing a dense program-code wall across the full hero. Desktop text ranges from approximately 4.2 to 6 pixels.

The wall is composed from:

- a low-contrast texture and scan-line surface;
- an almost invisible ambient code layer;
- a duplicate illuminated code layer behind the WebGL canvas.

During drag, pointer position updates CSS custom properties on the graph host:

- `--torch-x` and `--torch-y`;
- `--torch-radius`;
- `--torch-intensity`;
- `--torch-warmth`;
- `--torch-core`.

Pointer speed increases the light radius, code opacity, colour temperature and central halo. A multi-stop radial mask reveals the code gradually, resembling a torch illuminating writing on a dark wall rather than a flat circular spotlight. Both standard and WebKit mask declarations are included.

The code remains real DOM text and stays below the WebGL canvas. When the node is released, all light variables return to zero and the wall fades into darkness.

## Loading, accessibility and performance

The first render uses an inline SVG produced from the same presentation graph. Three.js is code-split and loaded after browser idle time or initial pointer interaction.

The implementation also:

- adapts graph source density for mobile, tablet and desktop;
- caps device pixel ratio;
- pauses animation in hidden documents;
- disposes geometries, materials and renderer resources on disconnect;
- preserves the SVG fallback after WebGL context loss;
- preserves a static fallback when `prefers-reduced-motion: reduce` is active;
- keeps all meaningful content in static HTML.
