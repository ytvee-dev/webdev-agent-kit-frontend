import { createRandom } from './random'
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

const pointInsideTongue = (
  x: number,
  y: number,
  centerX: number,
  baseY: number,
  height: number,
  width: number,
  lean: number,
): boolean => {
  const progress = (y - baseY) / height

  if (progress < 0 || progress > 1) {
    return false
  }

  const center = centerX + lean * progress
  const taper = Math.pow(1 - progress, 0.68)
  const ripple = 0.86 + Math.sin(progress * Math.PI * 2.4 + centerX * 9) * 0.14

  return Math.abs(x - center) <= width * taper * ripple
}

const pointInsideSilhouette = (x: number, y: number): boolean => {
  const body = pointInsideEllipse(x, y, 0, -0.16, 0.88, 0.72)
  const base = pointInsideEllipse(x, y, 0, -0.62, 0.72, 0.32)
  const leftShoulder = pointInsideEllipse(x, y, -0.68, -0.16, 0.29, 0.38)
  const rightShoulder = pointInsideEllipse(x, y, 0.68, -0.16, 0.29, 0.38)
  const center = pointInsideTongue(x, y, 0.02, 0.18, 1.12, 0.3, 0.08)
  const leftInner = pointInsideTongue(x, y, -0.31, 0.18, 0.78, 0.24, -0.09)
  const rightInner = pointInsideTongue(x, y, 0.34, 0.16, 0.76, 0.23, 0.12)
  const leftOuter = pointInsideTongue(x, y, -0.58, 0.02, 0.58, 0.19, -0.13)
  const rightOuter = pointInsideTongue(x, y, 0.61, 0.02, 0.6, 0.19, 0.12)

  return (
    body ||
    base ||
    leftShoulder ||
    rightShoulder ||
    center ||
    leftInner ||
    rightInner ||
    leftOuter ||
    rightOuter
  )
}

const pointInsideFaceVoid = (x: number, y: number): boolean => {
  const leftEye = pointInsideEllipse(x, y, -0.28, -0.17, 0.22, 0.2)
  const rightEye = pointInsideEllipse(x, y, 0.28, -0.17, 0.22, 0.2)
  const mouth = pointInsideEllipse(x, y, 0, -0.49, 0.39, 0.24)

  return leftEye || rightEye || mouth
}

const getFlameColor = (x: number, y: number): Rgb => {
  const radial = clamp(Math.hypot(x / 0.98, (y + 0.25) / 1.32), 0, 1)
  const height = clamp((y + 0.05) / 1.25, 0, 1)
  const edge = clamp(Math.abs(x) / 0.94, 0, 1)
  const heat = clamp(radial * 0.38 + height * 0.36 + edge * 0.28, 0, 1)
  const cream: Rgb = [1, 0.86, 0.56]
  const amber: Rgb = [1, 0.49, 0.08]
  const orange: Rgb = [1, 0.19, 0.025]
  const red: Rgb = [0.68, 0.025, 0.012]

  if (heat < 0.33) {
    return mixColor(cream, amber, heat / 0.33)
  }

  if (heat < 0.7) {
    return mixColor(amber, orange, (heat - 0.33) / 0.37)
  }

  return mixColor(orange, red, (heat - 0.7) / 0.3)
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

export const createCalciferGraph = ({
  nodeCount,
  seed = 20260710,
}: CreateGraphOptions): CalciferGraphData => {
  const random = createRandom(seed)
  const nodes: GraphNodeSeed[] = []
  const edges: GraphEdgeSeed[] = []
  const edgeKeys = new Set<string>()
  const flameNodeIds: number[] = []
  const desiredFlameCount = Math.max(120, Math.floor(nodeCount * 0.78))
  let attempts = 0

  while (flameNodeIds.length < desiredFlameCount && attempts < desiredFlameCount * 120) {
    attempts += 1
    const x = mix(-0.99, 0.99, random())
    const y = mix(-0.92, 1.31, random())

    if (!pointInsideSilhouette(x, y) || pointInsideFaceVoid(x, y)) {
      continue
    }

    const centerBias = 1 - clamp(Math.hypot(x / 0.93, (y + 0.18) / 1.28), 0, 1)
    const hub = random() < 0.105
    const size = hub
      ? mix(7.2, 11.2, random())
      : mix(2.25, 5.15, random() * 0.72 + centerBias * 0.28)
    const id = addNode(
      nodes,
      random,
      'flame',
      { x, y },
      size,
      getFlameColor(x, y),
      mix(5.2, 9.4, 1 - centerBias),
      mix(-0.04, 0.05, random()),
    )
    flameNodeIds.push(id)
  }

  const armNodeIds: number[] = []

  for (const side of [-1, 1]) {
    const mainArm: number[] = []
    const start = { x: side * 0.68, y: -0.08 }
    const control = { x: side * 1.02, y: 0.04 }
    const end = { x: side * 1.18, y: 0.55 }

    for (let index = 0; index < 16; index += 1) {
      const progress = index / 15
      const point = quadraticPoint(start, control, end, progress)
      point.x += Math.sin(progress * Math.PI * 2.2) * 0.025 * side
      point.y += Math.sin(progress * Math.PI) * 0.035
      const id = addNode(
        nodes,
        random,
        'arm',
        point,
        mix(4.2, 8.2, 0.35 + random() * 0.65),
        mixColor([1, 0.42, 0.055], [0.78, 0.035, 0.014], progress),
        7.8,
        0.02,
      )
      mainArm.push(id)
      armNodeIds.push(id)

      if (index > 0) {
        addEdge(edges, edgeKeys, nodes, mainArm[index - 1] ?? id, id, 17)
      }
    }

    for (let index = 0; index < 24; index += 1) {
      const progress = random()
      const center = quadraticPoint(start, control, end, progress)
      const spread = mix(0.035, 0.12, Math.sin(progress * Math.PI))
      const point = {
        x: center.x + mix(-spread, spread, random()),
        y: center.y + mix(-spread, spread, random()),
      }
      const id = addNode(
        nodes,
        random,
        'arm',
        point,
        mix(2.4, 5.1, random()),
        mixColor([1, 0.34, 0.035], [0.76, 0.025, 0.012], progress),
        7.2,
        mix(-0.015, 0.04, random()),
      )
      armNodeIds.push(id)
      const mainTarget = mainArm[Math.min(mainArm.length - 1, Math.round(progress * 15))]

      if (mainTarget !== undefined) {
        addEdge(edges, edgeKeys, nodes, id, mainTarget, 14)
      }
    }

    const root = mainArm[0]
    const rootNode = root === undefined ? undefined : nodes[root]

    if (root !== undefined && rootNode) {
      const target = nearestNode(nodes, rootNode, new Set<GraphNodeRole>(['flame']), root)
      addEdge(edges, edgeKeys, nodes, root, target, 18)
    }
  }

  const eyeNodeIds: number[] = []
  const pupilNodeIds: number[] = []

  for (const centerX of [-0.28, 0.28]) {
    const centerY = -0.17
    const outerRing: number[] = []
    const innerRing: number[] = []

    for (let index = 0; index < 30; index += 1) {
      const angle = (index / 30) * Math.PI * 2
      const point = {
        x: centerX + Math.cos(angle) * 0.19,
        y: centerY + Math.sin(angle) * 0.17,
      }
      const id = addNode(
        nodes,
        random,
        'eye',
        point,
        mix(4.1, 6.6, random()),
        mixColor([1, 0.78, 0.36], [1, 0.98, 0.86], random() * 0.76),
        15,
        0.11,
      )
      outerRing.push(id)
      eyeNodeIds.push(id)
    }

    for (let index = 0; index < 22; index += 1) {
      const angle = (index / 22) * Math.PI * 2
      const point = {
        x: centerX + Math.cos(angle) * 0.125,
        y: centerY + Math.sin(angle) * 0.112,
      }
      const id = addNode(
        nodes,
        random,
        'eye',
        point,
        mix(3.4, 5.4, random()),
        [1, 0.95, 0.79],
        15.5,
        0.12,
      )
      innerRing.push(id)
      eyeNodeIds.push(id)
    }

    for (let index = 0; index < outerRing.length; index += 1) {
      const current = outerRing[index]
      const next = outerRing[(index + 1) % outerRing.length]
      const inner = innerRing[Math.round((index / outerRing.length) * innerRing.length) % innerRing.length]

      if (current !== undefined && next !== undefined) {
        addEdge(edges, edgeKeys, nodes, current, next, 24)
      }

      if (current !== undefined && inner !== undefined && index % 2 === 0) {
        addEdge(edges, edgeKeys, nodes, current, inner, 19)
      }
    }

    for (let index = 0; index < innerRing.length; index += 1) {
      const current = innerRing[index]
      const next = innerRing[(index + 1) % innerRing.length]

      if (current !== undefined && next !== undefined) {
        addEdge(edges, edgeKeys, nodes, current, next, 23)
      }
    }

    for (let index = 0; index < 28; index += 1) {
      const angle = random() * Math.PI * 2
      const radius = Math.sqrt(random())
      const point = {
        x: centerX + Math.cos(angle) * 0.16 * radius,
        y: centerY + Math.sin(angle) * 0.142 * radius,
      }

      if (Math.hypot((point.x - centerX) / 0.16, (point.y - centerY) / 0.142) < 0.34) {
        continue
      }

      const id = addNode(
        nodes,
        random,
        'eye',
        point,
        mix(2.4, 4.5, random()),
        mixColor([1, 0.76, 0.28], [1, 0.99, 0.9], random()),
        15.5,
        0.12,
      )
      eyeNodeIds.push(id)
      const target = nearestNode(nodes, point, new Set<GraphNodeRole>(['eye']), id)
      addEdge(edges, edgeKeys, nodes, id, target, 17)
    }

    const pupilCenterX = centerX + (centerX < 0 ? 0.015 : -0.015)
    const pupilCenterY = centerY - 0.006
    const pupilRing: number[] = []

    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2
      const point = {
        x: pupilCenterX + Math.cos(angle) * 0.055,
        y: pupilCenterY + Math.sin(angle) * 0.052,
      }
      const id = addNode(nodes, random, 'pupil', point, 6.8, [0.012, 0.01, 0.009], 18, 0.16)
      pupilRing.push(id)
      pupilNodeIds.push(id)
    }

    for (let index = 0; index < pupilRing.length; index += 1) {
      const current = pupilRing[index]
      const next = pupilRing[(index + 1) % pupilRing.length]

      if (current !== undefined && next !== undefined) {
        addEdge(edges, edgeKeys, nodes, current, next, 26)
      }
    }

    for (let index = 0; index < 4; index += 1) {
      const pupil = pupilRing[index * 3]
      const eye = innerRing[index * 5]

      if (pupil !== undefined && eye !== undefined) {
        addEdge(edges, edgeKeys, nodes, pupil, eye, 16)
      }
    }

    for (const index of [1, 8, 16, 23]) {
      const eye = outerRing[index]

      if (eye !== undefined) {
        const eyeNode = nodes[eye]
        const target = eyeNode
          ? nearestNode(nodes, eyeNode, new Set<GraphNodeRole>(['flame']), eye)
          : -1
        addEdge(edges, edgeKeys, nodes, eye, target, 10)
      }
    }
  }

  const mouthNodeIds: number[] = []
  const upperLip: number[] = []
  const lowerLip: number[] = []

  for (let index = 0; index < 24; index += 1) {
    const progress = index / 23
    const point = quadraticPoint(
      { x: -0.34, y: -0.42 },
      { x: 0, y: -0.54 },
      { x: 0.34, y: -0.42 },
      progress,
    )
    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      mix(3.5, 5.8, random()),
      [0.92, 0.09, 0.022],
      16,
      0.14,
    )
    upperLip.push(id)
    mouthNodeIds.push(id)
  }

  for (let index = 0; index < 28; index += 1) {
    const progress = index / 27
    const point = quadraticPoint(
      { x: -0.34, y: -0.43 },
      { x: 0, y: -0.75 },
      { x: 0.34, y: -0.43 },
      progress,
    )
    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      mix(3.2, 5.4, random()),
      mixColor([0.96, 0.12, 0.026], [0.58, 0.018, 0.012], Math.sin(progress * Math.PI)),
      16,
      0.14,
    )
    lowerLip.push(id)
    mouthNodeIds.push(id)
  }

  for (const contour of [upperLip, lowerLip]) {
    for (let index = 1; index < contour.length; index += 1) {
      addEdge(edges, edgeKeys, nodes, contour[index - 1] ?? -1, contour[index] ?? -1, 24)
    }
  }

  addEdge(edges, edgeKeys, nodes, upperLip[0] ?? -1, lowerLip[0] ?? -1, 25)
  addEdge(
    edges,
    edgeKeys,
    nodes,
    upperLip[upperLip.length - 1] ?? -1,
    lowerLip[lowerLip.length - 1] ?? -1,
    25,
  )

  for (let index = 0; index < 32; index += 1) {
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random())
    const point = {
      x: Math.cos(angle) * 0.29 * radius,
      y: -0.53 + Math.sin(angle) * 0.13 * radius,
    }
    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      mix(2.2, 4.3, random()),
      mixColor([0.56, 0.012, 0.008], [1, 0.2, 0.035], random() * 0.72),
      16.5,
      0.145,
    )
    mouthNodeIds.push(id)
    const target = nearestNode(nodes, point, new Set<GraphNodeRole>(['mouth']), id)
    addEdge(edges, edgeKeys, nodes, id, target, 18)
  }

  for (const index of [0, 7, 15, 23]) {
    const mouth = upperLip[index]

    if (mouth !== undefined) {
      const mouthNode = nodes[mouth]
      const target = mouthNode
        ? nearestNode(nodes, mouthNode, new Set<GraphNodeRole>(['flame']), mouth)
        : -1
      addEdge(edges, edgeKeys, nodes, mouth, target, 10)
    }
  }

  const sparkNodeIds: number[] = []
  const clusterCount = Math.max(12, Math.floor(nodeCount / 30))

  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
    const angle = mix(0.04 * Math.PI, 0.96 * Math.PI, random())
    const radiusX = mix(1.04, 1.46, random())
    const radiusY = mix(0.9, 1.32, random())
    const center = {
      x: Math.cos(angle) * radiusX,
      y: Math.sin(angle) * radiusY + mix(-0.08, 0.16, random()),
    }
    const hub = addNode(
      nodes,
      random,
      'spark',
      center,
      mix(5.4, 9.6, random()),
      mixColor([1, 0.27, 0.025], [1, 0.82, 0.36], random()),
      mix(4.4, 7.2, random()),
      mix(-0.03, 0.08, random()),
    )
    sparkNodeIds.push(hub)
    const satelliteCount = 5 + Math.floor(random() * 7)
    let previous = hub

    for (let satelliteIndex = 0; satelliteIndex < satelliteCount; satelliteIndex += 1) {
      const satelliteAngle = random() * Math.PI * 2
      const distance = mix(0.035, 0.13, random())
      const point = {
        x: center.x + Math.cos(satelliteAngle) * distance,
        y: center.y + Math.sin(satelliteAngle) * distance,
      }
      const satellite = addNode(
        nodes,
        random,
        'spark',
        point,
        mix(1.8, 4.1, random()),
        mixColor([1, 0.18, 0.018], [1, 0.9, 0.55], random()),
        mix(3.8, 6.2, random()),
        mix(-0.04, 0.1, random()),
      )
      sparkNodeIds.push(satellite)
      addEdge(edges, edgeKeys, nodes, hub, satellite, 8.5)

      if (satelliteIndex > 0 && random() > 0.42) {
        addEdge(edges, edgeKeys, nodes, previous, satellite, 6.5)
      }

      previous = satellite
    }
  }

  const emberPairCount = Math.max(18, Math.floor(nodeCount / 18))

  for (let pairIndex = 0; pairIndex < emberPairCount; pairIndex += 1) {
    let x = mix(-1.46, 1.46, random())
    let y = mix(-0.28, 1.4, random())
    let safety = 0

    while (pointInsideSilhouette(x, y) && safety < 30) {
      x = mix(-1.46, 1.46, random())
      y = mix(-0.28, 1.4, random())
      safety += 1
    }

    const first = addNode(
      nodes,
      random,
      'spark',
      { x, y },
      mix(1.7, 3.6, random()),
      mixColor([1, 0.16, 0.015], [1, 0.78, 0.32], random()),
      mix(3.6, 5.5, random()),
      mix(-0.04, 0.08, random()),
    )
    const direction = random() * Math.PI * 2
    const distance = mix(0.025, 0.075, random())
    const second = addNode(
      nodes,
      random,
      'spark',
      {
        x: x + Math.cos(direction) * distance,
        y: y + Math.sin(direction) * distance,
      },
      mix(1.4, 2.8, random()),
      [1, 0.52, 0.08],
      mix(3.6, 5.5, random()),
      mix(-0.04, 0.08, random()),
    )
    sparkNodeIds.push(first, second)
    addEdge(edges, edgeKeys, nodes, first, second, 5.5)
  }

  connectNearestNeighbours(nodes, edges, edgeKeys, flameNodeIds, 4, 0.245, 10.5)
  connectNearestNeighbours(nodes, edges, edgeKeys, armNodeIds, 3, 0.18, 13)

  const connectedNodeIds = new Set<number>()

  for (const edge of edges) {
    connectedNodeIds.add(edge.source)
    connectedNodeIds.add(edge.target)
  }

  for (const nodeId of flameNodeIds) {
    if (connectedNodeIds.has(nodeId)) {
      continue
    }

    const node = nodes[nodeId]

    if (!node) {
      continue
    }

    const target = nearestNode(nodes, node, new Set<GraphNodeRole>(['flame']), nodeId)
    addEdge(edges, edgeKeys, nodes, nodeId, target, 10.5)
  }

  for (const nodeId of [...eyeNodeIds, ...pupilNodeIds, ...mouthNodeIds, ...sparkNodeIds]) {
    if (connectedNodeIds.has(nodeId)) {
      continue
    }

    const node = nodes[nodeId]

    if (!node) {
      continue
    }

    const roles = new Set<GraphNodeRole>([node.role])
    const target = nearestNode(nodes, node, roles, nodeId)
    addEdge(edges, edgeKeys, nodes, nodeId, target, node.role === 'spark' ? 5.5 : 12)
  }

  return { nodes, edges }
}
