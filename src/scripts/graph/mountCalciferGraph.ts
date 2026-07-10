import * as THREE from 'three'
import { createCalciferGraph } from './generateGraph'
import { createDragInfluence, createPhysicsState, stepGraphPhysics } from './physics'
import type { CalciferGraphData, Rgb } from './types'

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

    float core = 1.0 - smoothstep(0.05, 0.28, distanceToCenter);
    float halo = 1.0 - smoothstep(0.16, 0.5, distanceToCenter);
    float haloStrength = halo * vGlow;
    float alpha = clamp(core + haloStrength * (0.42 + vHeat * 0.26), 0.0, 1.0);
    vec3 fireCore = vec3(1.0, 0.9, 0.62);
    vec3 glow = mix(vColor, fireCore, (haloStrength * 0.22 + vHeat * 0.16) * vGlow);
    gl_FragColor = vec4(glow, alpha);
  }
`

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const getQualityNodeCount = (): number => {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const width = window.innerWidth

  if (coarsePointer || width < 640) {
    return 230
  }

  if (width < 1100) {
    return 330
  }

  return 470
}

const writeColor = (target: Float32Array, offset: number, color: Rgb, multiplier = 1): void => {
  target[offset] = color[0] * multiplier
  target[offset + 1] = color[1] * multiplier
  target[offset + 2] = color[2] * multiplier
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
    glow[node.id] = node.role === 'pupil' ? 0 : 1
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1))
  geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1))

  return geometry
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
    positions[offset] = source.x
    positions[offset + 1] = source.y
    positions[offset + 2] = source.z
    positions[offset + 3] = target.x
    positions[offset + 4] = target.y
    positions[offset + 5] = target.z
    writeColor(colors, offset, source.color, 0.56)
    writeColor(colors, offset + 3, target.color, 0.56)
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
  const camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.45, -1.45, 0.1, 20)
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
    opacity: 0.42,
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
    const pixelRatio = Math.min(window.devicePixelRatio, width < 700 ? 1.2 : 1.55)
    const aspect = width / height
    const vertical = aspect < 0.8 ? 1.72 : aspect < 1.15 ? 1.52 : 1.42
    const horizontal = vertical * aspect
    const centerX = aspect > 1.35 ? -horizontal * 0.31 : aspect > 1.05 ? -horizontal * 0.12 : 0
    const centerY = aspect < 0.8 ? 0.58 : aspect < 1.05 ? 0.18 : 0

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
      viewportScaleUniform.value = clamp(Math.min(width, height) / 720, 0.72, 1.18)
    }
  }

  const setTorch = (event: PointerEvent, intensity: number, speed = 0): void => {
    const rect = torchSurface.getBoundingClientRect()
    const x = clamp(event.clientX - rect.left, 0, rect.width)
    const y = clamp(event.clientY - rect.top, 0, rect.height)
    const radius = clamp(190 + speed * 240, 190, 350)

    torchSurface.style.setProperty('--torch-x', `${x}px`)
    torchSurface.style.setProperty('--torch-y', `${y}px`)
    torchSurface.style.setProperty('--torch-radius', `${radius}px`)
    torchSurface.style.setProperty('--torch-intensity', intensity.toFixed(3))
  }

  const updateGeometry = (elapsed: number): void => {
    const heatArray = heatAttribute.array as Float32Array
    const sizeArray = sizeAttribute.array as Float32Array
    const colorArray = colorAttribute.array as Float32Array

    for (let index = 0; index < graph.nodes.length; index += 1) {
      const seed = graph.nodes[index]
      const node = state.nodes[index]

      if (!seed || !node) {
        continue
      }

      const offset = index * 3
      const influence = dragInfluence?.[index] ?? 0
      const slowFlicker = Math.sin(elapsed * 2.35 + seed.phase)
      const quickFlicker = Math.sin(elapsed * 6.8 + seed.phase * 1.83)
      const upwardBias = clamp((seed.y + 0.85) / 2.15, 0, 1)
      const isFire = seed.role === 'flame' || seed.role === 'arm'
      const isSpark = seed.role === 'spark'
      const renderDriftX = isSpark
        ? Math.sin(elapsed * 1.5 + seed.phase) * 0.025
        : isFire
          ? quickFlicker * 0.0055 * (0.5 + upwardBias)
          : 0
      const renderDriftY = isSpark
        ? Math.sin(elapsed * 1.08 + seed.phase * 1.27) * 0.035
        : isFire
          ? Math.max(0, slowFlicker) * 0.009 * (0.45 + upwardBias)
          : 0
      const renderX = node.x + renderDriftX
      const renderY = node.y + renderDriftY
      const renderZ = node.z
      const idleHeat = isSpark
        ? 0.34 + (slowFlicker + 1) * 0.19
        : isFire
          ? 0.12 + Math.max(0, slowFlicker * 0.24 + quickFlicker * 0.12)
          : seed.role === 'eye'
            ? 0.22 + Math.max(0, slowFlicker) * 0.08
            : seed.role === 'mouth'
              ? 0.14 + Math.max(0, quickFlicker) * 0.12
              : 0
      const activeHeat = seed.role === 'pupil' ? 0 : clamp(idleHeat + influence * 0.92, 0, 1)
      const brightness = seed.role === 'pupil' ? 1 : 1 + activeHeat * 0.24
      const scalePulse =
        seed.role === 'pupil'
          ? 1
          : 1 + slowFlicker * (isSpark ? 0.12 : isFire ? 0.055 : 0.018) + influence * 0.2

      renderPositions[offset] = renderX
      renderPositions[offset + 1] = renderY
      renderPositions[offset + 2] = renderZ
      positionAttribute.setXYZ(index, renderX, renderY, renderZ)
      writeColor(colorArray, offset, seed.color, brightness)
      heatArray[index] = activeHeat
      sizeArray[index] = seed.size * scalePulse
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
      const edgeHeat = Math.max(dragInfluence?.[edge.source] ?? 0, dragInfluence?.[edge.target] ?? 0)
      const idlePulse =
        Math.max(0, Math.sin(elapsed * 2.1 + sourceSeed.phase + targetSeed.phase)) * 0.16
      const multiplier = 0.5 + idlePulse + edgeHeat * 0.72

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
    const threshold = event.pointerType === 'touch' ? 0.25 : 0.17
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
    setTorch(event, 0.74)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (draggedIndex < 0) {
      const point = getPointerWorld(event, canvas, camera)
      canvas.style.cursor = findNearestNode(graph, state, point, 0.17) >= 0 ? 'grab' : 'default'
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
    const intensity = clamp(0.62 + speed * 0.72, 0.62, 1)

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
