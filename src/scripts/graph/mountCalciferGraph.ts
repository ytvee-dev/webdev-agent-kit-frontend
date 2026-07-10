import * as THREE from 'three'
import { createCalciferGraph } from './generateGraph'
import { createDragInfluence, createPhysicsState, stepGraphPhysics } from './physics'
import type { CalciferGraphData, GraphNodeSeed, Rgb } from './types'

interface PointerSample {
  x: number
  y: number
  time: number
}

const vertexShader = `
  attribute float aSize;
  attribute float aHeat;
  attribute float aGlow;
  varying vec3 vColor;
  varying float vHeat;
  varying float vGlow;
  uniform float uPixelRatio;
  uniform float uViewportScale;

  void main() {
    vColor = color;
    vHeat = aHeat;
    vGlow = aGlow;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = aSize * uPixelRatio * uViewportScale;
  }
`

const fragmentShader = `
  varying vec3 vColor;
  varying float vHeat;
  varying float vGlow;

  void main() {
    float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
    if (distanceToCenter > 0.5) discard;

    float hardCore = 1.0 - smoothstep(0.04, 0.23, distanceToCenter);
    float softCore = 1.0 - smoothstep(0.11, 0.37, distanceToCenter);
    float halo = 1.0 - smoothstep(0.21, 0.5, distanceToCenter);
    float haloStrength = halo * vGlow;
    float alpha = clamp(hardCore + softCore * 0.55 + haloStrength * (0.31 + vHeat * 0.39), 0.0, 1.0);
    vec3 fireCore = vec3(1.0, 0.94, 0.72);
    vec3 glow = mix(vColor, fireCore, (softCore * 0.13 + haloStrength * 0.25 + vHeat * 0.18) * vGlow);
    gl_FragColor = vec4(glow, alpha);
  }
`

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const getQualityNodeCount = (): number => {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const width = window.innerWidth

  if (coarsePointer || width < 640) {
    return 340
  }

  if (width < 1100) {
    return 520
  }

  return 760
}

const writeColor = (target: Float32Array, offset: number, color: Rgb, multiplier = 1): void => {
  target[offset] = color[0] * multiplier
  target[offset + 1] = color[1] * multiplier
  target[offset + 2] = color[2] * multiplier
}

const getNodeGlow = (node: GraphNodeSeed): number => {
  if (node.role === 'pupil' || node.feature === 'eye-pupil') {
    return 0
  }

  if (node.feature === 'mouth-cavity') {
    return 0.045
  }

  if (node.feature === 'eye-highlight') {
    return 1.42
  }

  if (node.feature === 'eye-iris') {
    return 1.3
  }

  if (node.feature === 'eye-sclera') {
    return 1.22
  }

  if (node.feature === 'eye-outer-rim') {
    return 1.14
  }

  if (node.feature === 'mouth-highlight') {
    return 1.12
  }

  if (node.feature === 'mouth-tongue') {
    return 0.88
  }

  if (node.feature === 'mouth-inner-rim') {
    return 0.74
  }

  if (node.feature === 'mouth-outer-rim') {
    return 0.92
  }

  if (node.role === 'spark' || node.role === 'ember') {
    return 1.14
  }

  return 1
}

const createPointGeometry = (graph: CalciferGraphData): THREE.BufferGeometry => {
  const positions = new Float32Array(graph.nodes.length * 3)
  const colors = new Float32Array(graph.nodes.length * 3)
  const sizes = new Float32Array(graph.nodes.length)
  const heat = new Float32Array(graph.nodes.length)
  const glow = new Float32Array(graph.nodes.length)

  for (const node of graph.nodes) {
    const offset = node.id * 3
    positions[offset] = node.x
    positions[offset + 1] = node.y
    positions[offset + 2] = node.z
    writeColor(colors, offset, node.color)
    sizes[node.id] = node.size
    heat[node.id] = 0
    glow[node.id] = getNodeGlow(node)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1))
  geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1))

  return geometry
}

const getInitialEdgeMultiplier = (source: GraphNodeSeed, target: GraphNodeSeed): number => {
  const pupilEdge = source.role === 'pupil' || target.role === 'pupil'
  const irisSpoke =
    pupilEdge && (source.feature === 'eye-iris' || target.feature === 'eye-iris')
  const cavityEdge =
    source.feature === 'mouth-cavity' || target.feature === 'mouth-cavity'

  if (irisSpoke) {
    return 0.2
  }

  if (pupilEdge) {
    return 0.035
  }

  if (cavityEdge) {
    return 0.085
  }

  if (source.role === 'eye' && target.role === 'eye') {
    return 0.58
  }

  if (source.role === 'mouth' && target.role === 'mouth') {
    return 0.46
  }

  return 0.48
}

const createLineGeometry = (graph: CalciferGraphData): THREE.BufferGeometry => {
  const positions = new Float32Array(graph.edges.length * 6)
  const colors = new Float32Array(graph.edges.length * 6)

  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index]

    if (!edge) {
      continue
    }

    const source = graph.nodes[edge.source]
    const target = graph.nodes[edge.target]

    if (!source || !target) {
      continue
    }

    const offset = index * 6
    const multiplier = getInitialEdgeMultiplier(source, target)
    positions[offset] = source.x
    positions[offset + 1] = source.y
    positions[offset + 2] = source.z
    positions[offset + 3] = target.x
    positions[offset + 4] = target.y
    positions[offset + 5] = target.z
    writeColor(colors, offset, source.color, multiplier)
    writeColor(colors, offset + 3, target.color, multiplier)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  return geometry
}

const getPointerWorld = (
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  camera: THREE.OrthographicCamera,
): THREE.Vector3 => {
  const rect = canvas.getBoundingClientRect()
  const pointer = new THREE.Vector3(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
    0,
  )

  pointer.unproject(camera)
  pointer.z = 0

  return pointer
}

const findNearestNode = (
  graph: CalciferGraphData,
  state: ReturnType<typeof createPhysicsState>,
  point: THREE.Vector3,
  threshold: number,
): number => {
  let nearest = -1
  let nearestDistance = threshold

  for (let index = 0; index < graph.nodes.length; index += 1) {
    const node = state.nodes[index]

    if (!node) {
      continue
    }

    const distance = Math.hypot(node.x - point.x, node.y - point.y)

    if (distance < nearestDistance) {
      nearest = index
      nearestDistance = distance
    }
  }

  return nearest
}

const isCombustionNode = (node: GraphNodeSeed): boolean =>
  node.role === 'flame' ||
  node.role === 'rim' ||
  node.role === 'arm' ||
  node.role === 'spark' ||
  node.role === 'ember'

const getAnimatedEdgeMultiplier = (
  source: GraphNodeSeed,
  target: GraphNodeSeed,
  elapsed: number,
  dragHeat: number,
): number => {
  const pupilEdge = source.role === 'pupil' || target.role === 'pupil'
  const irisSpoke =
    pupilEdge && (source.feature === 'eye-iris' || target.feature === 'eye-iris')
  const cavityEdge =
    source.feature === 'mouth-cavity' || target.feature === 'mouth-cavity'
  const eyeEdge =
    (source.role === 'eye' || source.role === 'pupil') &&
    (target.role === 'eye' || target.role === 'pupil')
  const mouthEdge = source.role === 'mouth' && target.role === 'mouth'
  const height = (source.y + target.y) * 0.5
  const travellingWave = Math.sin(elapsed * 2.85 - height * 5.4 + source.phase * 0.55)
  const fastPulse = Math.sin(elapsed * 7.1 + source.phase + target.phase)
  const idlePulse = Math.max(0, travellingWave) * 0.19 + Math.max(0, fastPulse) * 0.075

  if (irisSpoke) {
    return 0.2 + idlePulse * 0.32 + dragHeat * 0.42
  }

  if (pupilEdge) {
    return 0.035 + dragHeat * 0.05
  }

  if (cavityEdge) {
    return 0.08 + idlePulse * 0.08 + dragHeat * 0.24
  }

  if (eyeEdge) {
    return 0.52 + idlePulse * 0.48 + dragHeat * 0.62
  }

  if (mouthEdge) {
    return 0.4 + idlePulse * 0.42 + dragHeat * 0.7
  }

  return 0.41 + idlePulse + dragHeat * 0.8
}

export const mountCalciferGraph = (
  host: HTMLElement,
  canvas: HTMLCanvasElement,
): (() => void) => {
  const graph = createCalciferGraph({ nodeCount: getQualityNodeCount() })
  const state = createPhysicsState(graph)
  const torchSurface = host.closest<HTMLElement>('.hero') ?? host
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !window.matchMedia('(pointer: coarse)').matches,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.55, -1.55, 0.1, 20)
  camera.position.z = 5

  const pointGeometry = createPointGeometry(graph)
  const pointMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    vertexColors: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uPixelRatio: { value: 1 },
      uViewportScale: { value: 1 },
    },
  })
  const points = new THREE.Points(pointGeometry, pointMaterial)
  points.renderOrder = 2
  points.frustumCulled = false

  const lineGeometry = createLineGeometry(graph)
  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.37,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
  lines.renderOrder = 1
  lines.frustumCulled = false

  scene.add(lines, points)

  let previousFrameTime = performance.now()
  let elapsedSeconds = 0
  const resizeObserver = new ResizeObserver(() => resize())
  const positionAttribute = pointGeometry.getAttribute('position') as THREE.BufferAttribute
  const colorAttribute = pointGeometry.getAttribute('color') as THREE.BufferAttribute
  const heatAttribute = pointGeometry.getAttribute('aHeat') as THREE.BufferAttribute
  const glowAttribute = pointGeometry.getAttribute('aGlow') as THREE.BufferAttribute
  const sizeAttribute = pointGeometry.getAttribute('aSize') as THREE.BufferAttribute
  const linePositionAttribute = lineGeometry.getAttribute('position') as THREE.BufferAttribute
  const lineColorAttribute = lineGeometry.getAttribute('color') as THREE.BufferAttribute
  const renderPositions = new Float32Array(graph.nodes.length * 3)
  let frameId = 0
  let disposed = false
  let paused = document.hidden
  let draggedIndex = -1
  let draggedPoint = new THREE.Vector3()
  let dragInfluence: Float32Array | undefined
  let pointerSample: PointerSample | undefined

  const resize = (): void => {
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    const pixelRatio = Math.min(window.devicePixelRatio, width < 700 ? 1.15 : 1.5)
    const aspect = width / height
    const vertical = aspect < 0.78 ? 1.82 : aspect < 1.08 ? 1.63 : 1.52
    const horizontal = vertical * aspect
    const centerX = aspect > 1.45 ? -horizontal * 0.335 : aspect > 1.08 ? -horizontal * 0.14 : 0
    const centerY = aspect < 0.78 ? 0.55 : aspect < 1.08 ? 0.18 : 0.05

    camera.top = centerY + vertical
    camera.bottom = centerY - vertical
    camera.left = centerX - horizontal
    camera.right = centerX + horizontal
    camera.updateProjectionMatrix()

    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height, false)

    const pixelRatioUniform = pointMaterial.uniforms.uPixelRatio
    const viewportScaleUniform = pointMaterial.uniforms.uViewportScale

    if (pixelRatioUniform) {
      pixelRatioUniform.value = pixelRatio
    }

    if (viewportScaleUniform) {
      viewportScaleUniform.value = clamp(Math.min(width, height) / 760, 0.66, 1.14)
    }
  }

  const setTorch = (event: PointerEvent, intensity: number, speed = 0): void => {
    const rect = torchSurface.getBoundingClientRect()
    const x = clamp(event.clientX - rect.left, 0, rect.width)
    const y = clamp(event.clientY - rect.top, 0, rect.height)
    const radius = clamp(145 + speed * 320, 145, 430)
    const warmth = clamp(0.42 + speed * 0.72, 0.42, 1)
    const core = clamp(0.48 + speed * 0.86, 0.48, 1)

    torchSurface.style.setProperty('--torch-x', `${x}px`)
    torchSurface.style.setProperty('--torch-y', `${y}px`)
    torchSurface.style.setProperty('--torch-radius', `${radius}px`)
    torchSurface.style.setProperty('--torch-intensity', intensity.toFixed(3))
    torchSurface.style.setProperty('--torch-warmth', warmth.toFixed(3))
    torchSurface.style.setProperty('--torch-core', core.toFixed(3))
  }

  const updateGeometry = (elapsed: number): void => {
    const heatArray = heatAttribute.array as Float32Array
    const glowArray = glowAttribute.array as Float32Array
    const sizeArray = sizeAttribute.array as Float32Array
    const colorArray = colorAttribute.array as Float32Array
    const gazeX = Math.sin(elapsed * 0.43) * 0.006
    const gazeY = Math.cos(elapsed * 0.36) * 0.004

    for (let index = 0; index < graph.nodes.length; index += 1) {
      const seed = graph.nodes[index]
      const node = state.nodes[index]

      if (!seed || !node) {
        continue
      }

      const offset = index * 3
      const influence = dragInfluence?.[index] ?? 0
      const slowFlicker = Math.sin(elapsed * 1.62 + seed.phase)
      const mediumFlicker = Math.sin(elapsed * 4.4 + seed.phase * 1.61)
      const quickFlicker = Math.sin(elapsed * 8.9 + seed.phase * 2.17)
      const thermalWave = Math.sin(elapsed * 2.35 - seed.y * 6.4 + seed.phase * 0.42)
      const secondThermalWave = Math.sin(elapsed * 3.75 - seed.y * 9.2 + seed.x * 2.8)
      const upwardBias = clamp((seed.y + 1.08) / 2.58, 0, 1)
      const combustion = isCombustionNode(seed)
      const detached = seed.role === 'spark' || seed.role === 'ember'
      const pupil = seed.role === 'pupil' || seed.feature === 'eye-pupil'
      const sclera =
        seed.feature === 'eye-sclera' ||
        seed.feature === 'eye-iris' ||
        seed.feature === 'eye-highlight' ||
        seed.feature === 'eye-outer-rim'
      const eyeHighlight = seed.feature === 'eye-highlight'
      const tongue = seed.feature === 'mouth-tongue' || seed.feature === 'mouth-highlight'
      const mouthRim =
        seed.feature === 'mouth-outer-rim' || seed.feature === 'mouth-inner-rim'
      const cavity = seed.feature === 'mouth-cavity'
      const eyeTwinkle = sclera
        ? Math.max(0, Math.sin(elapsed * (5.2 + (seed.phase % 1.4)) + seed.phase * 2.4))
        : 0
      const tonguePulse = tongue
        ? Math.max(0, Math.sin(elapsed * 3.8 - seed.x * 7.5 + seed.phase * 0.8))
        : 0
      const detachedLift = detached
        ? (1 - Math.cos(elapsed * (0.55 + (seed.phase % 0.37)) + seed.phase)) * 0.024
        : 0
      const renderDriftX = pupil
        ? gazeX
        : detached
          ? (slowFlicker * 0.027 + mediumFlicker * 0.01) *
            (seed.role === 'ember' ? 1.35 : 1)
          : combustion
            ? (mediumFlicker * 0.0064 + quickFlicker * 0.003) * (0.55 + upwardBias)
            : tongue
              ? mediumFlicker * 0.0018
              : 0
      const renderDriftY = pupil
        ? gazeY
        : detached
          ? (Math.max(0, thermalWave) * 0.036 + slowFlicker * 0.014 + detachedLift) *
            (seed.role === 'ember' ? 1.38 : 1)
          : combustion
            ? (Math.max(0, thermalWave) * 0.013 +
                Math.max(0, secondThermalWave) * 0.006 +
                mediumFlicker * 0.0035) *
              (0.48 + upwardBias)
            : tongue
              ? tonguePulse * 0.0045
              : 0
      const renderX = node.x + renderDriftX
      const renderY = node.y + renderDriftY
      const renderZ = node.z
      const combustionHeat = combustion
        ? 0.1 +
          Math.max(0, thermalWave) * 0.27 +
          Math.max(0, secondThermalWave) * 0.16 +
          Math.max(0, quickFlicker) * 0.1
        : 0
      const detachedHeat = detached
        ? 0.28 + (slowFlicker + 1) * 0.15 + Math.max(0, quickFlicker) * 0.2
        : 0
      const eyeHeat = sclera
        ? 0.23 + eyeTwinkle * (eyeHighlight ? 0.34 : 0.17)
        : 0
      const mouthHeat = cavity
        ? 0.015
        : tongue
          ? 0.14 + tonguePulse * 0.24 + Math.max(0, quickFlicker) * 0.08
          : mouthRim
            ? 0.12 + Math.max(0, mediumFlicker) * 0.13
            : 0
      const idleHeat = Math.max(combustionHeat, detachedHeat, eyeHeat, mouthHeat)
      const activeHeat = pupil ? 0 : clamp(idleHeat + influence * 0.96, 0, 1)
      const brightness = pupil
        ? 1
        : cavity
          ? 0.88
          : 1 + activeHeat * (eyeHighlight ? 0.36 : sclera ? 0.3 : 0.28)
      const pulseStrength = detached
        ? 0.18
        : seed.role === 'rim'
          ? 0.09
          : combustion
            ? 0.065
            : sclera
              ? eyeHighlight
                ? 0.1
                : 0.045
              : tongue
                ? 0.07
                : mouthRim
                  ? 0.025
                  : 0.012
      const scalePulse = pupil
        ? 1
        : 1 +
          slowFlicker * pulseStrength +
          quickFlicker * pulseStrength * 0.34 +
          eyeTwinkle * (eyeHighlight ? 0.12 : 0.035) +
          tonguePulse * (tongue ? 0.055 : 0) +
          influence * 0.22
      const baseGlow = getNodeGlow(seed)
      const glowPulse = pupil || cavity
        ? baseGlow
        : baseGlow * (0.82 + activeHeat * 0.34 + eyeTwinkle * 0.14 + tonguePulse * 0.08)

      renderPositions[offset] = renderX
      renderPositions[offset + 1] = renderY
      renderPositions[offset + 2] = renderZ
      positionAttribute.setXYZ(index, renderX, renderY, renderZ)
      writeColor(colorArray, offset, seed.color, brightness)
      heatArray[index] = activeHeat
      glowArray[index] = glowPulse
      sizeArray[index] = seed.size * Math.max(0.68, scalePulse)
    }

    for (let index = 0; index < graph.edges.length; index += 1) {
      const edge = graph.edges[index]

      if (!edge) {
        continue
      }

      const sourceSeed = graph.nodes[edge.source]
      const targetSeed = graph.nodes[edge.target]

      if (!sourceSeed || !targetSeed) {
        continue
      }

      const sourceOffset = edge.source * 3
      const targetOffset = edge.target * 3
      const lineOffset = index * 6
      const dragHeat = Math.max(
        dragInfluence?.[edge.source] ?? 0,
        dragInfluence?.[edge.target] ?? 0,
      )
      const multiplier = getAnimatedEdgeMultiplier(sourceSeed, targetSeed, elapsed, dragHeat)

      linePositionAttribute.setXYZ(
        index * 2,
        renderPositions[sourceOffset] ?? 0,
        renderPositions[sourceOffset + 1] ?? 0,
        renderPositions[sourceOffset + 2] ?? 0,
      )
      linePositionAttribute.setXYZ(
        index * 2 + 1,
        renderPositions[targetOffset] ?? 0,
        renderPositions[targetOffset + 1] ?? 0,
        renderPositions[targetOffset + 2] ?? 0,
      )
      writeColor(lineColorAttribute.array as Float32Array, lineOffset, sourceSeed.color, multiplier)
      writeColor(
        lineColorAttribute.array as Float32Array,
        lineOffset + 3,
        targetSeed.color,
        multiplier,
      )
    }

    positionAttribute.needsUpdate = true
    colorAttribute.needsUpdate = true
    heatAttribute.needsUpdate = true
    glowAttribute.needsUpdate = true
    sizeAttribute.needsUpdate = true
    linePositionAttribute.needsUpdate = true
    lineColorAttribute.needsUpdate = true
  }

  const animate = (): void => {
    if (disposed) {
      return
    }

    const currentFrameTime = performance.now()
    const delta = Math.min((currentFrameTime - previousFrameTime) / 1000, 1 / 30)
    previousFrameTime = currentFrameTime

    if (!paused) {
      elapsedSeconds += delta
      stepGraphPhysics(state, graph.edges, elapsedSeconds, delta, {
        draggedIndex: draggedIndex >= 0 ? draggedIndex : undefined,
        draggedX: draggedIndex >= 0 ? draggedPoint.x : undefined,
        draggedY: draggedIndex >= 0 ? draggedPoint.y : undefined,
        dragInfluence,
      })
      updateGeometry(elapsedSeconds)
      renderer.render(scene, camera)
    }

    frameId = window.requestAnimationFrame(animate)
  }

  const onPointerDown = (event: PointerEvent): void => {
    const point = getPointerWorld(event, canvas, camera)
    const threshold = event.pointerType === 'touch' ? 0.27 : 0.18
    const nearest = findNearestNode(graph, state, point, threshold)

    if (nearest < 0) {
      return
    }

    event.preventDefault()
    draggedIndex = nearest
    draggedPoint = point
    dragInfluence = createDragInfluence(graph.nodes.length, graph.edges, nearest)
    pointerSample = { x: event.clientX, y: event.clientY, time: performance.now() }
    canvas.setPointerCapture(event.pointerId)
    canvas.style.cursor = 'grabbing'
    host.dataset.dragging = 'true'
    setTorch(event, 0.84)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (draggedIndex < 0) {
      const point = getPointerWorld(event, canvas, camera)
      canvas.style.cursor = findNearestNode(graph, state, point, 0.18) >= 0 ? 'grab' : 'default'
      return
    }

    event.preventDefault()
    draggedPoint = getPointerWorld(event, canvas, camera)
    const now = performance.now()
    const previous = pointerSample
    const elapsed = Math.max(8, now - (previous?.time ?? now))
    const distance = Math.hypot(
      event.clientX - (previous?.x ?? event.clientX),
      event.clientY - (previous?.y ?? event.clientY),
    )
    const speed = distance / elapsed
    const intensity = clamp(0.7 + speed * 0.82, 0.7, 1)

    pointerSample = { x: event.clientX, y: event.clientY, time: now }
    setTorch(event, intensity, speed)
  }

  const releasePointer = (event: PointerEvent): void => {
    if (draggedIndex < 0) {
      return
    }

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }

    draggedIndex = -1
    dragInfluence = undefined
    pointerSample = undefined
    canvas.style.cursor = 'default'
    host.dataset.dragging = 'false'
    torchSurface.style.setProperty('--torch-intensity', '0')
    torchSurface.style.setProperty('--torch-warmth', '0')
    torchSurface.style.setProperty('--torch-core', '0')
  }

  const onVisibilityChange = (): void => {
    paused = document.hidden
    previousFrameTime = performance.now()
  }

  const onContextLost = (event: Event): void => {
    event.preventDefault()
    host.dataset.failed = 'true'
    host.dataset.ready = 'false'
  }

  const onContextRestored = (): void => {
    host.dataset.failed = 'false'
    resize()
    updateGeometry(elapsedSeconds)
    renderer.render(scene, camera)
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', releasePointer)
  canvas.addEventListener('pointercancel', releasePointer)
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)
  document.addEventListener('visibilitychange', onVisibilityChange)
  resizeObserver.observe(host)
  resize()
  updateGeometry(0)
  renderer.render(scene, camera)
  host.dataset.ready = 'true'
  host.dataset.failed = 'false'
  frameId = window.requestAnimationFrame(animate)

  return () => {
    disposed = true
    window.cancelAnimationFrame(frameId)
    resizeObserver.disconnect()
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', releasePointer)
    canvas.removeEventListener('pointercancel', releasePointer)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    canvas.removeEventListener('webglcontextrestored', onContextRestored)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    pointGeometry.dispose()
    pointMaterial.dispose()
    lineGeometry.dispose()
    lineMaterial.dispose()
    renderer.dispose()
  }
}
