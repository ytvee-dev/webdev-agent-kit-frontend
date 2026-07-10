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
  const taper = Math.pow(1 - progress, 0.72)
  const ripple = 0.86 + Math.sin(progress * Math.PI * 2.2 + centerX * 8) * 0.14

  return Math.abs(x - center) <= width * taper * ripple
}

const pointInsideFlame = (x: number, y: number): boolean => {
  const body = Math.pow(x / 0.79, 2) + Math.pow((y + 0.14) / 0.82, 2) <= 1
  const lowerGlow = Math.pow(x / 0.65, 2) + Math.pow((y + 0.55) / 0.42, 2) <= 1
  const center = pointInsideTongue(x, y, 0.02, 0.2, 0.93, 0.34, 0.08)
  const leftInner = pointInsideTongue(x, y, -0.34, 0.19, 0.66, 0.25, -0.08)
  const rightInner = pointInsideTongue(x, y, 0.36, 0.18, 0.69, 0.23, 0.1)
  const leftOuter = pointInsideTongue(x, y, -0.62, 0.02, 0.48, 0.18, -0.08)
  const rightOuter = pointInsideTongue(x, y, 0.63, 0.04, 0.46, 0.17, 0.09)

  return body || lowerGlow || center || leftInner || rightInner || leftOuter || rightOuter
}

const getFlameColor = (x: number, y: number): Rgb => {
  const centerDistance = clamp(
    Math.sqrt(Math.pow(x / 0.86, 2) + Math.pow((y + 0.34) / 1.12, 2)),
    0,
    1,
  )
  const heightHeat = clamp((y + 0.12) / 1.05, 0, 1)
  const edgeHeat = clamp(Math.abs(x) / 0.82, 0, 1)
  const heat = clamp(centerDistance * 0.45 + heightHeat * 0.42 + edgeHeat * 0.23, 0, 1)
  const yellow: Rgb = [1, 0.82, 0.22]
  const orange: Rgb = [1, 0.29, 0.035]
  const red: Rgb = [0.72, 0.045, 0.018]

  if (heat < 0.58) {
    return mixColor(yellow, orange, heat / 0.58)
  }

  return mixColor(orange, red, (heat - 0.58) / 0.42)
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
  if (source === target) {
    return
  }

  const first = Math.min(source, target)
  const second = Math.max(source, target)
  const key = `${first}:${second}`

  if (keys.has(key)) {
    return
  }

  const sourceNode = nodes[source]
  const targetNode = nodes[target]

  if (!sourceNode || !targetNode) {
    return
  }

  keys.add(key)
  edges.push({
    source: first,
    target: second,
    restLength: Math.hypot(sourceNode.x - targetNode.x, sourceNode.y - targetNode.y),
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
  const desiredFlameCount = Math.max(54, Math.floor(nodeCount * 0.72))
  let attempts = 0

  while (flameNodeIds.length < desiredFlameCount && attempts < desiredFlameCount * 80) {
    attempts += 1
    const x = mix(-0.92, 0.92, random())
    const y = mix(-0.96, 1.12, random())

    if (!pointInsideFlame(x, y)) {
      continue
    }

    const coreBias = 1 - clamp(Math.hypot(x / 0.9, (y + 0.15) / 1.16), 0, 1)
    const size = mix(3.2, 7.4, random() * 0.64 + coreBias * 0.36)
    const id = addNode(
      nodes,
      random,
      'flame',
      { x, y },
      size,
      getFlameColor(x, y),
      mix(4.6, 7.8, 1 - coreBias),
      mix(-0.03, 0.03, random()),
    )
    flameNodeIds.push(id)
  }

  const armNodeIds: number[] = []
  const armDefinitions = [
    {
      start: { x: -0.66, y: -0.15 },
      control: { x: -0.98, y: -0.52 },
      end: { x: -1.19, y: -0.23 },
    },
    {
      start: { x: 0.66, y: -0.15 },
      control: { x: 0.98, y: -0.52 },
      end: { x: 1.19, y: -0.23 },
    },
  ]

  for (const definition of armDefinitions) {
    const arm: number[] = []

    for (let index = 0; index < 11; index += 1) {
      const progress = index / 10
      const point = quadraticPoint(definition.start, definition.control, definition.end, progress)
      const id = addNode(
        nodes,
        random,
        'arm',
        point,
        mix(4.4, 6.8, 1 - Math.abs(progress - 0.85)),
        mixColor([1, 0.34, 0.045], [0.83, 0.07, 0.018], progress),
        6.8,
        0.015,
      )
      arm.push(id)
      armNodeIds.push(id)

      if (index > 0) {
        addEdge(edges, edgeKeys, nodes, arm[index - 1] ?? id, id, 16)
      }
    }

    const root = arm[0]
    const rootNode = root === undefined ? undefined : nodes[root]

    if (root !== undefined && rootNode) {
      const nearest = nearestNode(nodes, rootNode, new Set<GraphNodeRole>(['flame']), root)
      addEdge(edges, edgeKeys, nodes, root, nearest, 17)
    }
  }

  const eyeNodeIds: number[] = []
  const pupilNodeIds: number[] = []

  for (const centerX of [-0.27, 0.27]) {
    const ring: number[] = []

    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2
      const point = {
        x: centerX + Math.cos(angle) * 0.155,
        y: -0.12 + Math.sin(angle) * 0.135,
      }
      const id = addNode(nodes, random, 'eye', point, 5.9, [1, 0.95, 0.79], 12, 0.09)
      ring.push(id)
      eyeNodeIds.push(id)
    }

    for (let index = 0; index < ring.length; index += 1) {
      const current = ring[index]
      const next = ring[(index + 1) % ring.length]

      if (current !== undefined && next !== undefined) {
        addEdge(edges, edgeKeys, nodes, current, next, 22)
      }
    }

    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2
      const point = {
        x: centerX + (centerX < 0 ? 0.025 : -0.025) + Math.cos(angle) * 0.035,
        y: -0.135 + Math.sin(angle) * 0.035,
      }
      const id = addNode(nodes, random, 'pupil', point, 6.8, [0.06, 0.045, 0.035], 16, 0.13)
      pupilNodeIds.push(id)

      const ringTarget = ring[(index * 3 + 1) % ring.length]
      if (ringTarget !== undefined) {
        addEdge(edges, edgeKeys, nodes, id, ringTarget, 18)
      }
    }
  }

  const mouthNodeIds: number[] = []

  for (let index = 0; index < 15; index += 1) {
    const progress = index / 14
    const point = quadraticPoint(
      { x: -0.21, y: -0.39 },
      { x: 0, y: -0.56 },
      { x: 0.21, y: -0.39 },
      progress,
    )
    const id = addNode(nodes, random, 'mouth', point, 5.2, [0.31, 0.025, 0.018], 15, 0.12)
    mouthNodeIds.push(id)

    if (index > 0) {
      addEdge(edges, edgeKeys, nodes, mouthNodeIds[index - 1] ?? id, id, 22)
    }
  }

  connectNearestNeighbours(nodes, edges, edgeKeys, flameNodeIds, 3, 0.31, 10.5)
  connectNearestNeighbours(nodes, edges, edgeKeys, armNodeIds, 2, 0.3, 14)

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

    const nearest = nearestNode(nodes, node, new Set<GraphNodeRole>(['flame']), nodeId)
    addEdge(edges, edgeKeys, nodes, nodeId, nearest, 10.5)
  }

  for (const nodeId of [...eyeNodeIds, ...pupilNodeIds, ...mouthNodeIds]) {
    const node = nodes[nodeId]

    if (!node) {
      continue
    }

    const nearest = nearestNode(nodes, node, new Set<GraphNodeRole>(['flame']), nodeId)
    addEdge(edges, edgeKeys, nodes, nodeId, nearest, 8)
  }

  return { nodes, edges }
}
