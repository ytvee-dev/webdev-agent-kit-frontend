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
  varying vec3 vColor;
  varying float vHeat;
  uniform float uPixelRatio;
  uniform float uViewportScale;

  void main() {
    vColor = color;
    vHeat = aHeat;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = aSize * uPixelRatio * uViewportScale;
  }
`

const fragmentShader = `
  varying vec3 vColor;
  varying float vHeat;

  void main() {
    float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
    if (distanceToCenter > 0.5) discard;

    float core = 1.0 - smoothstep(0.08, 0.34, distanceToCenter);
    float halo = 1.0 - smoothstep(0.18, 0.5, distanceToCenter);
    float alpha = clamp(core + halo * (0.36 + vHeat * 0.18), 0.0, 1.0);
    vec3 glow = mix(vColor, vec3(1.0, 0.86, 0.52), halo * 0.18 + vHeat * 0.12);
    gl_FragColor = vec4(glow, alpha);
  }
`

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const getQualityNodeCount = (): number => {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const width = window.innerWidth

  if (coarsePointer || width < 640) {
    return 160
  }

  if (width < 1100) {
    return 220
  }

  return 310
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

  for (const node of graph.nodes) {
    const offset = node.id * 3
    positions[offset] = node.x
    positions[offset + 1] = node.y
    positions[offset + 2] = node.z
    writeColor(colors, offset, node.color)
    sizes[node.id] = node.size
    heat[node.id] = 0
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1))

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
    writeColor(colors, offset, source.color, 0.58)
    writeColor(colors, offset + 3, target.color, 0.58)
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
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !window.matchMedia('(pointer: coarse)').matches,
    powerPreference: 'high-performance',
  })
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1.45, 1.45, 1.35, -1.35, 0.1, 20)
  camera.position.z = 5

  const pointGeometry = createPointGeometry(graph)
  const pointMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    vertexColors: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uPixelRatio: { value: 1 },
      uViewportScale: { value: 1 },
    },
  })
  const points = new THREE.Points(pointGeometry, pointMaterial)
  points.renderOrder = 2

  const lineGeometry = createLineGeometry(graph)
  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
  lines.renderOrder = 1

  scene.add(lines, points)

  let previousFrameTime = performance.now()
  let elapsedSeconds = 0
  const resizeObserver = new ResizeObserver(() => resize())
  const positionAttribute = pointGeometry.getAttribute('position') as THREE.BufferAttribute
  const colorAttribute = pointGeometry.getAttribute('color') as THREE.BufferAttribute
  const heatAttribute = pointGeometry.getAttribute('aHeat') as THREE.BufffWrAttribute
  const sizeAttribute = pointGeometry.getAttribute('aSize') as THREE.BufferAttribute
  const linePositionAttribute = lineGeometry.getAttribute('position') as THREE.BufferAttribute
  const lineColorAttribute = lineGeometry.getAttribute('color') as THREE.BufferAttribute
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
    const pixelRatio = Math.min(window.devicePixelRatio, width < 700 ? 1.25 : 1.6)
    const aspect = width / height
    const vertical = 1.28

    camera.top = vertical
    camera.bottom = -vertical
    camera.left = -vertical * aspect
    camera.right = vertical * aspect
    camera.updateProjectionMatrix()

    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height, false)
    pointMaterial.uniforms.uPixelRatio = { value: pixelRatio }
    pointMaterial.uniforms.uViewportScale = {
      value: clamp(Math.min(width, height) / 620, 0.78, 1.18),
    }
  }

  const setTorch = (event: PointerEvent, intensity: number): void => {
    const rect = host.getBoundingClientRect()
    const x = clamp(event.clientX - rect.left, 0, rect.width)
    const y = clamp(event.clientY - rect.top, 0, rect.height)
    host.style.setProperty('--torch-x', `${x}px`)
    host.style.setProperty('--torch-y', `${y}px`)
    host.style.setProperty('--torch-intensity', intensity.toFixed(3))
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
      const flicker =
        seed.role === 'flame' || seed.role === 'arm'
          ? (Math.sin(elapsed * 4.3 + seed.phase) + Math.sin(elapsed * 7.1 + seed.phase * 1.7)) *
            0.055
          : 0
      const activeHeat = clamp(influence * 0.9 + Math.max(0, flicker), 0, 1)
      const brightness = 1 + activeHeat * 0.2

      positionAttribute.setXYZ(index, node.x, node.y, node.z)
      writeColor(colorArray, offset, seed.color, brightness)
      heatArray[index] = activeHeat
      sizeArray[index] = seed.size * (1 + flicker * 0.6 + influence * 0.18)
    }

    for (let index = 0; index < graph.edges.length; index += 1) {
      const edge = graph.edges[index]

      if (!edge) {
        continue
      }

      const source = state.nodes[edge.source]
      const target = state.nodes[edge.target]
      const sourceSeed = graph.nodes[edge.source]
      const targetSeed = graph.nodes[edge.target]

      if (!source || !target || !sourceSeed || !targetSeed) {
        continue
      }

      const offset = index * 6
      const edgeHeat = Math.max(dragInfluence?.[edge.source] ?? 0, dragInfluence?.[edge.target] ?? 0)
      const multiplier = 0.56 + edgeHeat * 0.62

      linePositionAttribute.setXYZ(index * 2, source.x, source.y, source.z)
      linePositionAttribute.setXYZ(index * 2 + 1, target.x, target.y, target.z)
      writeColor(lineColorAttribute.array as Float32Array, offset, sourceSeed.color, multiplier)
      writeColor(lineColorAttribute.array as Float32Array, offset + 3, targetSeed.color, multiplier)
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
    const threshold = event.pointerType === 'touch' ? 0.24 : 0.16
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
    setTorch(event, 0.72)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (draggedIndex < 0) {
      const point = getPointerWorld(event, canvas, camera)
      canvas.style.cursor = findNearestNode(graph, state, point, 0.16) >= 0 ? 'grab' : 'default'
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
    const intensity = clamp(0.58 + speed * 0.7, 0.58, 1)

    pointerSample = { x: event.clientX, y: event.clientY, time: now }
    setTorch(event, intensity)
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
    host.style.setProperty('--torch-intensity', '0')
  }

  const onVisibilityChange = (): void => {
    paused = document.hidden
  }

  const onContextLost = (event: Event): void => {
    event.preventDefault()
    host.dataset.failed = 'true'
    host.dataset.ready = 'false'
  }

  const onContextRestored = (): void => {
    host.dataset.failed = 'false'
    resize()
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
