import { createRandom } from './random'
import { REFERENCE_MASK_BOUNDS, sampleReferenceDensity } from './referenceMask'
import type {
  CalciferGraphData,
  GraphEdgeSeed,
  GraphNodeRole,
  GraphNodeSeed,
  Rgb,
} from './types'

interface CreateGraphOptions {
  nodeCount: number
  seed?: number
}

interface Point {
  x: number
  y: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const mix = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount

const mixColor = (from: Rgb, to: Rgb, amount: number): Rgb => [
  mix(from[0], to[0], amount),
  mix(from[1], to[1], amount),
  mix(from[2], to[2], amount),
]

const pointInsideEllipse = (
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): boolean =>
  Math.pow((x - centerX) / radiusX, 2) + Math.pow((y - centerY) / radiusY, 2) <= 1

const pointInsideFaceVoid = (x: number, y: number): boolean => {
  const leftEye = pointInsideEllipse(x, y, -0.29, -0.25, 0.235, 0.215)
  const rightEye = pointInsideEllipse(x, y, 0.29, -0.25, 0.235, 0.215)
  const mouth = pointInsideEllipse(x, y, 0, -0.61, 0.43, 0.255)

  return leftEye || rightEye || mouth
}

const quadraticPoint = (start: Point, control: Point, end: Point, progress: number): Point => {
  const inverse = 1 - progress

  return {
    x:
      inverse * inverse * start.x +
      2 * inverse * progress * control.x +
      progress * progress * end.x,
    y:
      inverse * inverse * start.y +
      2 * inverse * progress * control.y +
      progress * progress * end.y,
  }
}

const cubicPoint = (
  start: Point,
  controlA: Point,
  controlB: Point,
  end: Point,
  progress: number,
): Point => {
  const inverse = 1 - progress

  return {
    x:
      inverse * inverse * inverse * start.x +
      3 * inverse * inverse * progress * controlA.x +
      3 * inverse * progress * progress * controlB.x +
      progress * progress * progress * end.x,
    y:
      inverse * inverse * inverse * start.y +
      3 * inverse * inverse * progress * controlA.y +
      3 * inverse * progress * progress * controlB.y +
      progress * progress * progress * end.y,
  }
}

const getFireColor = (x: number, y: number, density: number, variation: number): Rgb => {
  const vertical = clamp((y - REFERENCE_MASK_BOUNDS.minY) / 2.56, 0, 1)
  const radial = clamp(Math.hypot(x / 1.24, (y + 0.28) / 1.52), 0, 1)
  const coolness = clamp(vertical * 0.62 + radial * 0.3 + (1 - density) * 0.16, 0, 1)
  const cream: Rgb = [1, 0.9, 0.48]
  const amber: Rgb = [1, 0.53, 0.045]
  const orange: Rgb = [1, 0.19, 0.018]
  const crimson: Rgb = [0.93, 0.015, 0.08]
  const magenta: Rgb = [0.82, 0.025, 0.48]
  const violet: Rgb = [0.43, 0.08, 0.82]
  const blue: Rgb = [0.05, 0.34, 0.95]
  let color: Rgb

  if (coolness < 0.2) {
    color = mixColor(cream, amber, coolness / 0.2)
  } else if (coolness < 0.43) {
    color = mixColor(amber, orange, (coolness - 0.2) / 0.23)
  } else if (coolness < 0.65) {
    color = mixColor(orange, crimson, (coolness - 0.43) / 0.22)
  } else if (coolness < 0.82) {
    color = mixColor(crimson, magenta, (coolness - 0.65) / 0.17)
  } else if (coolness < 0.94) {
    color = mixColor(magenta, violet, (coolness - 0.82) / 0.12)
  } else {
    color = mixColor(violet, blue, (coolness - 0.94) / 0.06)
  }

  return mixColor(color, cream, variation * 0.08 * density)
}

const getMaskEdge = (x: number, y: number): number => {
  const center = sampleReferenceDensity(x, y)
  const offset = 0.042
  const neighbours = [
    sampleReferenceDensity(x - offset, y),
    sampleReferenceDensity(x + offset, y),
    sampleReferenceDensity(x, y - offset),
    sampleReferenceDensity(x, y + offset),
  ]
  const minimum = Math.min(...neighbours)
  const maximum = Math.max(...neighbours)

  return clamp(Math.max(center - minimum, maximum - minimum), 0, 1)
}

const addNode = (
  nodes: GraphNodeSeed[],
  random: () => number,
  role: GraphNodeRole,
  point: Point,
  size: number,
  color: Rgb,
  anchorStrength: number,
  z = 0,
): number => {
  const id = nodes.length

  nodes.push({
    id,
    role,
    x: point.x,
    y: point.y,
    z,
    size,
    color,
    anchorStrength,
    phase: random() * Math.PI * 2,
  })

  return id
}

const addEdge = (
  edges: GraphEdgeSeed[],
  keys: Set<string>,
  nodes: GraphNodeSeed[],
  source: number,
  target: number,
  stiffness: number,
): void => {
  if (source === target || source < 0 || target < 0) {
    return
  }

  const first = Math.min(source, target)
  const second = Math.max(source, target)
  const key = `${first}:${second}`

  if (keys.has(key)) {
    return
  }

  const sourceNode = nodes[first]
  const targetNode = nodes[second]

  if (!sourceNode || !targetNode) {
    return
  }

  keys.add(key)
  edges.push({
    source: first,
    target: second,
    restLength: Math.hypot(
      sourceNode.x - targetNode.x,
      sourceNode.y - targetNode.y,
      sourceNode.z - targetNode.z,
    ),
    stiffness,
  })
}

const nearestNode = (
  nodes: GraphNodeSeed[],
  point: Point,
  roles: ReadonlySet<GraphNodeRole>,
  excluded = -1,
): number => {
  let nearest = -1
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const node of nodes) {
    if (node.id === excluded || !roles.has(node.role)) {
      continue
    }

    const distance = Math.hypot(node.x - point.x, node.y - point.y)

    if (distance < nearestDistance) {
      nearest = node.id
      nearestDistance = distance
    }
  }

  return nearest
}

const connectNearestNeighbours = (
  nodes: GraphNodeSeed[],
  edges: GraphEdgeSeed[],
  keys: Set<string>,
  nodeIds: number[],
  neighbours: number,
  maxDistance: number,
  stiffness: number,
): void => {
  for (const source of nodeIds) {
    const sourceNode = nodes[source]

    if (!sourceNode) {
      continue
    }

    const candidates = nodeIds
      .filter((target) => target !== source)
      .map((target) => {
        const targetNode = nodes[target]

        return {
          target,
          distance: targetNode
            ? Math.hypot(sourceNode.x - targetNode.x, sourceNode.y - targetNode.y)
            : Number.POSITIVE_INFINITY,
        }
      })
      .filter(({ distance }) => distance <= maxDistance)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, neighbours)

    for (const candidate of candidates) {
      addEdge(edges, keys, nodes, source, candidate.target, stiffness)
    }
  }
}

const connectLoop = (
  nodes: GraphNodeSeed[],
  edges: GraphEdgeSeed[],
  keys: Set<string>,
  nodeIds: number[],
  stiffness: number,
): void => {
  for (let index = 0; index < nodeIds.length; index += 1) {
    const current = nodeIds[index]
    const next = nodeIds[(index + 1) % nodeIds.length]

    if (current !== undefined && next !== undefined) {
      addEdge(edges, keys, nodes, current, next, stiffness)
    }
  }
}

const connectChain = (
  nodes: GraphNodeSeed[],
  edges: GraphEdgeSeed[],
  keys: Set<string>,
  nodeIds: number[],
  stiffness: number,
): void => {
  for (let index = 1; index < nodeIds.length; index += 1) {
    const previous = nodeIds[index - 1]
    const current = nodeIds[index]

    if (previous !== undefined && current !== undefined) {
      addEdge(edges, keys, nodes, previous, current, stiffness)
    }
  }
}

const addEye = (
  nodes: GraphNodeSeed[],
  edges: GraphEdgeSeed[],
  edgeKeys: Set<string>,
  random: () => number,
  centerX: number,
): { eyeIds: number[]; pupilIds: number[] } => {
  const centerY = -0.25
  const eyeIds: number[] = []
  const pupilIds: number[] = []
  const outerRing: number[] = []
  const innerRing: number[] = []

  for (let index = 0; index < 42; index += 1) {
    const angle = (index / 42) * Math.PI * 2
    const wobble = 1 + Math.sin(angle * 5 + centerX * 8) * 0.025
    const point = {
      x: centerX + Math.cos(angle) * 0.205 * wobble,
      y: centerY + Math.sin(angle) * 0.184 * wobble,
    }
    const id = addNode(
      nodes,
      random,
      'eye',
      point,
      mix(3.2, 7.6, random()),
      mixColor([1, 0.72, 0.18], [1, 0.99, 0.9], 0.62 + random() * 0.38),
      17,
      0.16,
    )
    outerRing.push(id)
    eyeIds.push(id)
  }

  for (let index = 0; index < 32; index += 1) {
    const angle = (index / 32) * Math.PI * 2
    const point = {
      x: centerX + Math.cos(angle) * 0.132,
      y: centerY + Math.sin(angle) * 0.119,
    }
    const id = addNode(
      nodes,
      random,
      'eye',
      point,
      mix(2.8, 5.8, random()),
      [1, 0.96, 0.78],
      17.5,
      0.17,
    )
    innerRing.push(id)
    eyeIds.push(id)
  }

  connectLoop(nodes, edges, edgeKeys, outerRing, 27)
  connectLoop(nodes, edges, edgeKeys, innerRing, 27)

  for (let index = 0; index < outerRing.length; index += 2) {
    const outer = outerRing[index]
    const inner = innerRing[Math.floor((index / outerRing.length) * innerRing.length)]

    if (outer !== undefined && inner !== undefined) {
      addEdge(edges, edgeKeys, nodes, outer, inner, 21)
    }
  }

  for (let index = 0; index < 68; index += 1) {
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random())
    const point = {
      x: centerX + Math.cos(angle) * 0.176 * radius,
      y: centerY + Math.sin(angle) * 0.158 * radius,
    }
    const normalized = Math.hypot((point.x - centerX) / 0.176, (point.y - centerY) / 0.158)

    if (normalized < 0.31) {
      continue
    }

    const id = addNode(
      nodes,
      random,
      'eye',
      point,
      mix(1.8, 4.4, random()),
      mixColor([1, 0.67, 0.13], [1, 1, 0.92], random()),
      17,
      0.17,
    )
    eyeIds.push(id)
    const target = nearestNode(nodes, point, new Set<GraphNodeRole>(['eye']), id)
    addEdge(edges, edgeKeys, nodes, id, target, 18)
  }

  const pupilCenterX = centerX + (centerX < 0 ? 0.012 : -0.012)
  const pupilCenterY = centerY - 0.004
  const pupilRing: number[] = []

  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2
    const point = {
      x: pupilCenterX + Math.cos(angle) * 0.058,
      y: pupilCenterY + Math.sin(angle) * 0.055,
    }
    const id = addNode(nodes, random, 'pupil', point, mix(5.8, 8.6, random()), [0.006, 0.005, 0.006], 22, 0.2)
    pupilRing.push(id)
    pupilIds.push(id)
  }

  connectLoop(nodes, edges, edgeKeys, pupilRing, 31)

  const pupilHub = addNode(
    nodes,
    random,
    'pupil',
    { x: pupilCenterX, y: pupilCenterY },
    12.5,
    [0.003, 0.003, 0.004],
    24,
    0.205,
  )
  pupilIds.push(pupilHub)

  for (let index = 0; index < pupilRing.length; index += 3) {
    const pupil = pupilRing[index]
    const eye = innerRing[Math.floor((index / pupilRing.length) * innerRing.length)]

    if (pupil !== undefined) {
      addEdge(edges, edgeKeys, nodes, pupilHub, pupil, 31)
    }

    if (pupil !== undefined && eye !== undefined) {
      addEdge(edges, edgeKeys, nodes, pupil, eye, 18)
    }
  }

  for (const index of [2, 11, 21, 31]) {
    const eye = outerRing[index]

    if (eye !== undefined) {
      const eyeNode = nodes[eye]
      const target = eyeNode
        ? nearestNode(nodes, eyeNode, new Set<GraphNodeRole>(['flame', 'rim']), eye)
        : -1
      addEdge(edges, edgeKeys, nodes, eye, target, 12)
    }
  }

  return { eyeIds, pupilIds }
}

const addMouth = (
  nodes: GraphNodeSeed[],
  edges: GraphEdgeSeed[],
  edgeKeys: Set<string>,
  random: () => number,
): number[] => {
  const mouthIds: number[] = []
  const upperLip: number[] = []
  const lowerLip: number[] = []

  for (let index = 0; index < 34; index += 1) {
    const progress = index / 33
    const point = quadraticPoint(
      { x: -0.39, y: -0.48 },
      { x: 0, y: -0.59 },
      { x: 0.39, y: -0.48 },
      progress,
    )
    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      mix(3.2, 6.6, random()),
      mixColor([1, 0.22, 0.025], [0.68, 0.012, 0.02], Math.sin(progress * Math.PI) * 0.5),
      18,
      0.18,
    )
    upperLip.push(id)
    mouthIds.push(id)
  }

  for (let index = 0; index < 38; index += 1) {
    const progress = index / 37
    const point = quadraticPoint(
      { x: -0.39, y: -0.49 },
      { x: 0, y: -0.86 },
      { x: 0.39, y: -0.49 },
      progress,
    )
    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      mix(3, 6.2, random()),
      mixColor([0.94, 0.045, 0.02], [0.48, 0.006, 0.018], Math.sin(progress * Math.PI)),
      18,
      0.18,
    )
    lowerLip.push(id)
    mouthIds.push(id)
  }

  connectChain(nodes, edges, edgeKeys, upperLip, 29)
  connectChain(nodes, edges, edgeKeys, lowerLip, 29)
  addEdge(edges, edgeKeys, nodes, upperLip[0] ?? -1, lowerLip[0] ?? -1, 30)
  addEdge(
    edges,
    edgeKeys,
    nodes,
    upperLip[upperLip.length - 1] ?? -1,
    lowerLip[lowerLip.length - 1] ?? -1,
    30,
  )

  for (let index = 0; index < 86; index += 1) {
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random())
    const point = {
      x: Math.cos(angle) * 0.34 * radius,
      y: -0.64 + Math.sin(angle) * 0.17 * radius,
    }
    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      mix(1.8, 4.8, random()),
      mixColor([0.16, 0.002, 0.008], [1, 0.12, 0.025], Math.pow(random(), 1.6)),
      18.5,
      0.19,
    )
    mouthIds.push(id)
    const target = nearestNode(nodes, point, new Set<GraphNodeRole>(['mouth']), id)
    addEdge(edges, edgeKeys, nodes, id, target, 20)
  }

  for (let index = 0; index < 24; index += 1) {
    const progress = index / 23
    const point = quadraticPoint(
      { x: -0.25, y: -0.7 },
      { x: 0, y: -0.79 },
      { x: 0.25, y: -0.7 },
      progress,
    )
    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      mix(2.2, 4.5, random()),
      mixColor([0.72, 0.015, 0.025], [1, 0.23, 0.035], 0.45 + random() * 0.55),
      19,
      0.2,
    )
    mouthIds.push(id)
  }

  for (const index of [0, 9, 18, 27]) {
    const mouth = upperLip[index]

    if (mouth !== undefined) {
      const mouthNode = nodes[mouth]
      const target = mouthNode
        ? nearestNode(nodes, mouthNode, new Set<GraphNodeRole>(['flame', 'rim']), mouth)
        : -1
      addEdge(edges, edgeKeys, nodes, mouth, target, 12)
    }
  }

  return mouthIds
}

export const createCalciferGraph = ({
  nodeCount,
  seed = 20260710,
}: CreateGraphOptions): CalciferGraphData => {
  const random = createRandom(seed)
  const nodes: GraphNodeSeed[] = []
  const edges: GraphEdgeSeed[] = []
  const edgeKeys = new Set<string>()
  const flameNodeIds: number[] = []
  const rimNodeIds: number[] = []
  const desiredFlameCount = Math.max(180, Math.floor(nodeCount * 0.84))
  let attempts = 0

  while (flameNodeIds.length < desiredFlameCount && attempts < desiredFlameCount * 180) {
    attempts += 1
    const x = mix(REFERENCE_MASK_BOUNDS.minX, REFERENCE_MASK_BOUNDS.maxX, random())
    const y = mix(REFERENCE_MASK_BOUNDS.minY, REFERENCE_MASK_BOUNDS.maxY, random())
    const density = sampleReferenceDensity(x, y)

    if (density < 0.12 || pointInsideFaceVoid(x, y)) {
      continue
    }

    const acceptance = clamp(0.15 + density * 0.94, 0, 1)

    if (random() > acceptance) {
      continue
    }

    const edge = getMaskEdge(x, y)
    const hub = random() < 0.028 + density * 0.052
    const size = hub
      ? mix(7.2, 13.8, random())
      : mix(1.7, 5.8, Math.pow(random(), 1.35) * 0.76 + density * 0.24)
    const id = addNode(
      nodes,
      random,
      'flame',
      { x, y },
      size,
      getFireColor(x, y, density, random()),
      mix(5.4, 10.8, edge * 0.58 + (1 - density) * 0.42),
      mix(-0.055, 0.07, random()),
    )
    flameNodeIds.push(id)
  }

  const desiredRimCount = Math.max(82, Math.floor(nodeCount * 0.17))
  attempts = 0

  while (rimNodeIds.length < desiredRimCount && attempts < desiredRimCount * 260) {
    attempts += 1
    const x = mix(REFERENCE_MASK_BOUNDS.minX, REFERENCE_MASK_BOUNDS.maxX, random())
    const y = mix(REFERENCE_MASK_BOUNDS.minY, REFERENCE_MASK_BOUNDS.maxY, random())
    const density = sampleReferenceDensity(x, y)
    const edge = getMaskEdge(x, y)

    if (density < 0.13 || edge < 0.15 || pointInsideFaceVoid(x, y)) {
      continue
    }

    const id = addNode(
      nodes,
      random,
      'rim',
      { x, y },
      random() < 0.12 ? mix(6.5, 10.8, random()) : mix(2.2, 6.2, random()),
      getFireColor(x, y, Math.max(0.2, density * 0.62), random()),
      11.2,
      mix(0.035, 0.1, random()),
    )
    rimNodeIds.push(id)
  }

  const armNodeIds: number[] = []

  for (const side of [-1, 1]) {
    const mainArm: number[] = []
    const start = { x: side * 0.66, y: -0.12 }
    const controlA = { x: side * 0.94, y: -0.02 }
    const controlB = { x: side * 1.12, y: 0.35 }
    const end = { x: side * 1.27, y: 0.68 }

    for (let index = 0; index < 24; index += 1) {
      const progress = index / 23
      const point = cubicPoint(start, controlA, controlB, end, progress)
      point.x += Math.sin(progress * Math.PI * 3.1) * 0.022 * side
      point.y += Math.sin(progress * Math.PI) * 0.045
      const id = addNode(
        nodes,
        random,
        'arm',
        point,
        random() < 0.16 ? mix(6.8, 11.4, random()) : mix(2.8, 7.2, random()),
        getFireColor(point.x, point.y, 0.36, random()),
        10.2,
        0.07,
      )
      mainArm.push(id)
      armNodeIds.push(id)
    }

    connectChain(nodes, edges, edgeKeys, mainArm, 22)

    for (let index = 0; index < 56; index += 1) {
      const progress = random()
      const center = cubicPoint(start, controlA, controlB, end, progress)
      const spread = mix(0.025, 0.14, Math.sin(progress * Math.PI))
      const point = {
        x: center.x + mix(-spread, spread, random()),
        y: center.y + mix(-spread, spread, random()),
      }
      const id = addNode(
        nodes,
        random,
        'arm',
        point,
        mix(1.9, 5.6, random()),
        getFireColor(point.x, point.y, 0.24, random()),
        9.5,
        mix(0.02, 0.09, random()),
      )
      armNodeIds.push(id)
      const mainTarget = mainArm[Math.min(mainArm.length - 1, Math.round(progress * 23))]

      if (mainTarget !== undefined) {
        addEdge(edges, edgeKeys, nodes, id, mainTarget, 17)
      }
    }

    const root = mainArm[0]
    const rootNode = root === undefined ? undefined : nodes[root]

    if (root !== undefined && rootNode) {
      const target = nearestNode(nodes, rootNode, new Set<GraphNodeRole>(['flame', 'rim']), root)
      addEdge(edges, edgeKeys, nodes, root, target, 23)
    }
  }

  connectNearestNeighbours(nodes, edges, edgeKeys, flameNodeIds, 4, 0.205, 12.2)
  connectNearestNeighbours(nodes, edges, edgeKeys, rimNodeIds, 3, 0.18, 16)
  connectNearestNeighbours(nodes, edges, edgeKeys, armNodeIds, 3, 0.215, 17)

  for (const rimId of rimNodeIds) {
    const rim = nodes[rimId]

    if (!rim) {
      continue
    }

    const target = nearestNode(nodes, rim, new Set<GraphNodeRole>(['flame']), rimId)
    addEdge(edges, edgeKeys, nodes, rimId, target, 13)
  }

  const hubIds = flameNodeIds.filter((id) => (nodes[id]?.size ?? 0) >= 8)

  for (const hubId of hubIds) {
    const hub = nodes[hubId]

    if (!hub) {
      continue
    }

    const candidates = flameNodeIds
      .filter((id) => id !== hubId)
      .map((id) => {
        const node = nodes[id]

        return {
          id,
          distance: node ? Math.hypot(node.x - hub.x, node.y - hub.y) : Number.POSITIVE_INFINITY,
        }
      })
      .filter(({ distance }) => distance > 0.2 && distance < 0.52)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 3)

    for (const candidate of candidates) {
      addEdge(edges, edgeKeys, nodes, hubId, candidate.id, 8.8)
    }
  }

  const leftEye = addEye(nodes, edges, edgeKeys, random, -0.29)
  const rightEye = addEye(nodes, edges, edgeKeys, random, 0.29)
  const mouthNodeIds = addMouth(nodes, edges, edgeKeys, random)
  const sparkNodeIds: number[] = []
  const emberNodeIds: number[] = []
  const clusterCount = Math.max(20, Math.floor(nodeCount / 24))

  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
    const angle = mix(-0.06 * Math.PI, 1.06 * Math.PI, random())
    const radiusX = mix(1.1, 1.58, random())
    const radiusY = mix(0.96, 1.5, random())
    const center = {
      x: Math.cos(angle) * radiusX,
      y: Math.sin(angle) * radiusY + mix(-0.08, 0.2, random()),
    }
    const hub = addNode(
      nodes,
      random,
      'spark',
      center,
      mix(5.6, 12.4, random()),
      getFireColor(center.x, center.y, 0.16, random()),
      6.2,
      0.11,
    )
    sparkNodeIds.push(hub)
    const rays = Math.floor(mix(7, 15, random()))

    for (let rayIndex = 0; rayIndex < rays; rayIndex += 1) {
      const rayAngle = random() * Math.PI * 2
      const segments = random() < 0.42 ? 2 : 1
      let previous = hub

      for (let segmentIndex = 0; segmentIndex < segments; segmentIndex += 1) {
        const distance = mix(0.045, 0.15, random()) * (segmentIndex + 1)
        const point = {
          x: center.x + Math.cos(rayAngle) * distance,
          y: center.y + Math.sin(rayAngle) * distance,
        }
        const id = addNode(
          nodes,
          random,
          'spark',
          point,
          mix(1.7, 4.3, random()),
          getFireColor(point.x, point.y, 0.08, random()),
          5.4,
          mix(0.07, 0.15, random()),
        )
        sparkNodeIds.push(id)
        addEdge(edges, edgeKeys, nodes, previous, id, 11.5)
        previous = id
      }
    }
  }

  const emberPairCount = Math.max(34, Math.floor(nodeCount / 8))

  for (let pairIndex = 0; pairIndex < emberPairCount; pairIndex += 1) {
    const angle = mix(-0.12 * Math.PI, 1.12 * Math.PI, random())
    const radius = mix(1.06, 1.72, random())
    const start = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * mix(0.9, 1.46, random()) + mix(-0.14, 0.22, random()),
    }
    const direction = mix(-0.4, 0.4, random())
    const end = {
      x: start.x + direction,
      y: start.y + mix(0.04, 0.16, random()),
    }
    const first = addNode(
      nodes,
      random,
      'ember',
      start,
      mix(1.5, 4.4, random()),
      getFireColor(start.x, start.y, 0.05, random()),
      3.8,
      0.12,
    )
    const second = addNode(
      nodes,
      random,
      'ember',
      end,
      mix(1.4, 3.7, random()),
      getFireColor(end.x, end.y, 0.04, random()),
      3.4,
      0.13,
    )
    emberNodeIds.push(first, second)
    addEdge(edges, edgeKeys, nodes, first, second, 8.5)
  }

  connectNearestNeighbours(nodes, edges, edgeKeys, sparkNodeIds, 2, 0.26, 9.5)

  const connectedNodeIds = new Set<number>()

  for (const edge of edges) {
    connectedNodeIds.add(edge.source)
    connectedNodeIds.add(edge.target)
  }

  const allRoles = new Set<GraphNodeRole>([
    'flame',
    'rim',
    'arm',
    'eye',
    'pupil',
    'mouth',
    'spark',
    'ember',
  ])

  for (const node of nodes) {
    if (connectedNodeIds.has(node.id)) {
      continue
    }

    const target = nearestNode(nodes, node, allRoles, node.id)
    addEdge(edges, edgeKeys, nodes, node.id, target, 8)
  }

  const faceIds = [
    ...leftEye.eyeIds,
    ...leftEye.pupilIds,
    ...rightEye.eyeIds,
    ...rightEye.pupilIds,
    ...mouthNodeIds,
  ]

  for (const faceId of faceIds) {
    const node = nodes[faceId]

    if (!node) {
      continue
    }

    const target = nearestNode(nodes, node, new Set<GraphNodeRole>(['flame', 'rim']), faceId)
    addEdge(edges, edgeKeys, nodes, faceId, target, 11)
  }

  return { nodes, edges }
}
