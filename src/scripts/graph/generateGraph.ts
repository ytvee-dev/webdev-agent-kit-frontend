import { createRandom } from './random'
import { REFERENCE_MASK_BOUNDS, sampleReferenceDensity } from './referenceMask'
import type {
  CalciferGraphData,
  GraphEdgeSeed,
  GraphNodeFeature,
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

interface EyeDefinition {
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
  pupilOffsetX: number
  pupilOffsetY: number
  wobblePhase: number
}

interface FaceGroup {
  ids: number[]
  anchors: number[]
}

const TAU = Math.PI * 2

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
  const leftEye = pointInsideEllipse(x, y, -0.305, -0.255, 0.252, 0.232)
  const rightEye = pointInsideEllipse(x, y, 0.295, -0.248, 0.242, 0.222)
  const mouth = pointInsideEllipse(x, y, 0, -0.64, 0.455, 0.275)

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
  feature?: GraphNodeFeature,
): number => {
  const id = nodes.length
  const node: GraphNodeSeed = {
    id,
    role,
    x: point.x,
    y: point.y,
    z,
    size,
    color,
    anchorStrength,
    phase: random() * TAU,
  }

  if (feature !== undefined) {
    node.feature = feature
  }

  nodes.push(node)

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

const nearestNodeFromIds = (
  nodes: GraphNodeSeed[],
  point: Point,
  nodeIds: number[],
  excluded = -1,
): number => {
  let nearest = -1
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const nodeId of nodeIds) {
    if (nodeId === excluded) {
      continue
    }

    const node = nodes[nodeId]

    if (!node) {
      continue
    }

    const distance = Math.hypot(node.x - point.x, node.y - point.y)

    if (distance < nearestDistance) {
      nearest = nodeId
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
  definition: EyeDefinition,
  detailScale: number,
): FaceGroup => {
  const ids: number[] = []
  const anchors: number[] = []
  const outerRing: number[] = []
  const middleRing: number[] = []
  const irisRing: number[] = []
  const pupilRing: number[] = []
  const scleraIds: number[] = []
  const outerCount = Math.round(mix(34, 48, detailScale))
  const middleCount = Math.round(mix(28, 40, detailScale))
  const irisCount = Math.round(mix(22, 30, detailScale))
  const scleraCount = Math.round(mix(58, 116, detailScale))
  const highlightCount = Math.round(mix(8, 14, detailScale))
  const pupilCount = Math.round(mix(16, 22, detailScale))
  const pupilFillCount = Math.round(mix(8, 16, detailScale))

  for (let index = 0; index < outerCount; index += 1) {
    const angle = (index / outerCount) * TAU
    const wobble =
      1 +
      Math.sin(angle * 5 + definition.wobblePhase) * 0.024 +
      Math.sin(angle * 9 - definition.wobblePhase) * 0.012
    const point = {
      x: definition.centerX + Math.cos(angle) * definition.radiusX * wobble,
      y: definition.centerY + Math.sin(angle) * definition.radiusY * wobble,
    }
    const hub = random() < 0.12
    const id = addNode(
      nodes,
      random,
      'eye',
      point,
      hub ? mix(6.2, 9.4, random()) : mix(2.2, 6.2, random()),
      mixColor([1, 0.44, 0.055], [1, 0.98, 0.84], 0.52 + random() * 0.48),
      19,
      0.175,
      'eye-outer-rim',
    )
    outerRing.push(id)
    ids.push(id)
  }

  for (let index = 0; index < middleCount; index += 1) {
    const angle = (index / middleCount) * TAU
    const wobble = 1 + Math.sin(angle * 7 + definition.wobblePhase * 0.7) * 0.018
    const point = {
      x: definition.centerX + Math.cos(angle) * definition.radiusX * 0.79 * wobble,
      y: definition.centerY + Math.sin(angle) * definition.radiusY * 0.79 * wobble,
    }
    const id = addNode(
      nodes,
      random,
      'eye',
      point,
      mix(1.9, 5.2, random()),
      mixColor([1, 0.76, 0.23], [1, 1, 0.94], 0.64 + random() * 0.36),
      19.5,
      0.18,
      'eye-sclera',
    )
    middleRing.push(id)
    ids.push(id)
  }

  connectLoop(nodes, edges, edgeKeys, outerRing, 30)
  connectLoop(nodes, edges, edgeKeys, middleRing, 29)

  for (let index = 0; index < outerRing.length; index += 2) {
    const outer = outerRing[index]
    const middle = middleRing[Math.floor((index / outerRing.length) * middleRing.length)]

    if (outer !== undefined && middle !== undefined) {
      addEdge(edges, edgeKeys, nodes, outer, middle, 23)
    }
  }

  for (let index = 0; index < scleraCount; index += 1) {
    const angle = random() * TAU
    const minimumRadius = 0.31
    const maximumRadius = 0.93
    const radius = Math.sqrt(
      minimumRadius * minimumRadius +
        random() * (maximumRadius * maximumRadius - minimumRadius * minimumRadius),
    )
    const jitter = mix(0.96, 1.04, random())
    const point = {
      x: definition.centerX + Math.cos(angle) * definition.radiusX * radius * jitter,
      y: definition.centerY + Math.sin(angle) * definition.radiusY * radius / jitter,
    }
    const hub = random() < 0.035
    const id = addNode(
      nodes,
      random,
      'eye',
      point,
      hub ? mix(5.2, 7.8, random()) : mix(1.25, 4.15, Math.pow(random(), 1.3)),
      mixColor([1, 0.76, 0.22], [1, 1, 0.96], 0.6 + random() * 0.4),
      19.2,
      mix(0.178, 0.195, random()),
      'eye-sclera',
    )
    scleraIds.push(id)
    ids.push(id)
  }

  connectNearestNeighbours(
    nodes,
    edges,
    edgeKeys,
    [...middleRing, ...scleraIds],
    3,
    Math.max(definition.radiusX, definition.radiusY) * 0.43,
    19,
  )

  for (let index = 0; index < irisCount; index += 1) {
    const angle = (index / irisCount) * TAU
    const wobble = 1 + Math.sin(angle * 6 - definition.wobblePhase) * 0.018
    const point = {
      x:
        definition.centerX +
        definition.pupilOffsetX +
        Math.cos(angle) * definition.radiusX * 0.34 * wobble,
      y:
        definition.centerY +
        definition.pupilOffsetY +
        Math.sin(angle) * definition.radiusY * 0.34 * wobble,
    }
    const id = addNode(
      nodes,
      random,
      'eye',
      point,
      mix(2.2, 5.6, random()),
      mixColor([1, 0.69, 0.12], [1, 1, 0.9], 0.52 + random() * 0.48),
      20.5,
      0.205,
      'eye-iris',
    )
    irisRing.push(id)
    ids.push(id)
  }

  connectLoop(nodes, edges, edgeKeys, irisRing, 31)

  const pupilCenter = {
    x: definition.centerX + definition.pupilOffsetX,
    y: definition.centerY + definition.pupilOffsetY,
  }

  for (let index = 0; index < pupilCount; index += 1) {
    const angle = (index / pupilCount) * TAU
    const point = {
      x: pupilCenter.x + Math.cos(angle) * definition.radiusX * 0.235,
      y: pupilCenter.y + Math.sin(angle) * definition.radiusY * 0.235,
    }
    const id = addNode(
      nodes,
      random,
      'pupil',
      point,
      mix(4.6, 7.8, random()),
      [0.004, 0.004, 0.006],
      24,
      0.24,
      'eye-pupil',
    )
    pupilRing.push(id)
    ids.push(id)
  }

  connectLoop(nodes, edges, edgeKeys, pupilRing, 34)

  const pupilHub = addNode(
    nodes,
    random,
    'pupil',
    pupilCenter,
    mix(11.5, 14.5, random()),
    [0.002, 0.002, 0.004],
    26,
    0.245,
    'eye-pupil',
  )
  ids.push(pupilHub)

  for (let index = 0; index < pupilFillCount; index += 1) {
    const angle = random() * TAU
    const radius = Math.sqrt(random()) * 0.19
    const point = {
      x: pupilCenter.x + Math.cos(angle) * definition.radiusX * radius,
      y: pupilCenter.y + Math.sin(angle) * definition.radiusY * radius,
    }
    const id = addNode(
      nodes,
      random,
      'pupil',
      point,
      mix(3.2, 6.4, random()),
      [0.003, 0.003, 0.005],
      25,
      mix(0.235, 0.248, random()),
      'eye-pupil',
    )
    ids.push(id)
    addEdge(edges, edgeKeys, nodes, pupilHub, id, 32)
  }

  for (let index = 0; index < irisRing.length; index += 2) {
    const iris = irisRing[index]
    const pupil = pupilRing[Math.floor((index / irisRing.length) * pupilRing.length)]

    if (iris !== undefined && pupil !== undefined) {
      addEdge(edges, edgeKeys, nodes, iris, pupil, 23)
    }
  }

  const highlightCenter = {
    x: definition.centerX - definition.radiusX * 0.36,
    y: definition.centerY + definition.radiusY * 0.38,
  }
  const highlightIds: number[] = []

  for (let index = 0; index < highlightCount; index += 1) {
    const angle = random() * TAU
    const radius = Math.sqrt(random())
    const point = {
      x: highlightCenter.x + Math.cos(angle) * definition.radiusX * 0.12 * radius,
      y: highlightCenter.y + Math.sin(angle) * definition.radiusY * 0.1 * radius,
    }
    const id = addNode(
      nodes,
      random,
      'eye',
      point,
      mix(1.6, 4.2, random()),
      [1, 1, 0.98],
      20,
      0.225,
      'eye-highlight',
    )
    highlightIds.push(id)
    ids.push(id)
  }

  connectNearestNeighbours(nodes, edges, edgeKeys, highlightIds, 2, 0.075, 22)

  for (const highlightId of highlightIds) {
    const highlight = nodes[highlightId]

    if (!highlight) {
      continue
    }

    const target = nearestNodeFromIds(nodes, highlight, [...middleRing, ...scleraIds], highlightId)
    addEdge(edges, edgeKeys, nodes, highlightId, target, 20)
  }

  for (const index of [1, Math.floor(outerCount * 0.25), Math.floor(outerCount * 0.5), Math.floor(outerCount * 0.75)]) {
    const anchor = outerRing[index]

    if (anchor !== undefined) {
      anchors.push(anchor)
    }
  }

  return { ids, anchors }
}

const addMouth = (
  nodes: GraphNodeSeed[],
  edges: GraphEdgeSeed[],
  edgeKeys: Set<string>,
  random: () => number,
  detailScale: number,
): FaceGroup => {
  const ids: number[] = []
  const anchors: number[] = []
  const outerUpper: number[] = []
  const outerLower: number[] = []
  const innerUpper: number[] = []
  const innerLower: number[] = []
  const tongueIds: number[] = []
  const upperCount = Math.round(mix(30, 42, detailScale))
  const lowerCount = Math.round(mix(34, 48, detailScale))
  const innerUpperCount = Math.round(mix(26, 36, detailScale))
  const innerLowerCount = Math.round(mix(30, 40, detailScale))
  const cavityCount = Math.round(mix(10, 18, detailScale))
  const tongueCount = Math.round(mix(36, 72, detailScale))
  const tongueCurveCount = Math.round(mix(20, 30, detailScale))
  const highlightCount = Math.round(mix(18, 30, detailScale))

  const addContour = (
    target: number[],
    count: number,
    start: Point,
    control: Point,
    end: Point,
    feature: 'mouth-outer-rim' | 'mouth-inner-rim',
    outer: boolean,
  ): void => {
    for (let index = 0; index < count; index += 1) {
      const progress = index / (count - 1)
      const point = quadraticPoint(start, control, end, progress)
      const corner = Math.min(progress, 1 - progress)
      const hub = corner < 0.075 || random() < 0.045
      const id = addNode(
        nodes,
        random,
        'mouth',
        point,
        hub ? mix(6.2, 9.3, random()) : mix(2.1, outer ? 6.1 : 5.1, random()),
        outer
          ? mixColor([1, 0.43, 0.045], [0.82, 0.018, 0.032], Math.sin(progress * Math.PI) * 0.68)
          : mixColor([1, 0.18, 0.025], [0.42, 0.004, 0.016], Math.sin(progress * Math.PI) * 0.76),
        outer ? 20 : 21,
        outer ? 0.205 : 0.215,
        feature,
      )
      target.push(id)
      ids.push(id)
    }
  }

  addContour(
    outerUpper,
    upperCount,
    { x: -0.42, y: -0.505 },
    { x: 0, y: -0.575 },
    { x: 0.42, y: -0.505 },
    'mouth-outer-rim',
    true,
  )
  addContour(
    outerLower,
    lowerCount,
    { x: -0.42, y: -0.515 },
    { x: 0, y: -0.9 },
    { x: 0.42, y: -0.515 },
    'mouth-outer-rim',
    true,
  )
  addContour(
    innerUpper,
    innerUpperCount,
    { x: -0.355, y: -0.545 },
    { x: 0, y: -0.605 },
    { x: 0.355, y: -0.545 },
    'mouth-inner-rim',
    false,
  )
  addContour(
    innerLower,
    innerLowerCount,
    { x: -0.355, y: -0.555 },
    { x: 0, y: -0.825 },
    { x: 0.355, y: -0.555 },
    'mouth-inner-rim',
    false,
  )

  connectChain(nodes, edges, edgeKeys, outerUpper, 32)
  connectChain(nodes, edges, edgeKeys, outerLower, 32)
  connectChain(nodes, edges, edgeKeys, innerUpper, 31)
  connectChain(nodes, edges, edgeKeys, innerLower, 31)
  addEdge(edges, edgeKeys, nodes, outerUpper[0] ?? -1, outerLower[0] ?? -1, 34)
  addEdge(
    edges,
    edgeKeys,
    nodes,
    outerUpper[outerUpper.length - 1] ?? -1,
    outerLower[outerLower.length - 1] ?? -1,
    34,
  )
  addEdge(edges, edgeKeys, nodes, innerUpper[0] ?? -1, innerLower[0] ?? -1, 33)
  addEdge(
    edges,
    edgeKeys,
    nodes,
    innerUpper[innerUpper.length - 1] ?? -1,
    innerLower[innerLower.length - 1] ?? -1,
    33,
  )

  for (let index = 0; index < outerUpper.length; index += 3) {
    const outer = outerUpper[index]
    const inner = innerUpper[Math.floor((index / outerUpper.length) * innerUpper.length)]

    if (outer !== undefined && inner !== undefined) {
      addEdge(edges, edgeKeys, nodes, outer, inner, 24)
    }
  }

  for (let index = 0; index < outerLower.length; index += 3) {
    const outer = outerLower[index]
    const inner = innerLower[Math.floor((index / outerLower.length) * innerLower.length)]

    if (outer !== undefined && inner !== undefined) {
      addEdge(edges, edgeKeys, nodes, outer, inner, 24)
    }
  }

  for (let index = 0; index < cavityCount; index += 1) {
    const angle = random() * TAU
    const radius = Math.sqrt(random())
    const point = {
      x: Math.cos(angle) * 0.31 * radius,
      y: -0.64 + Math.sin(angle) * 0.115 * radius,
    }

    if (point.y < -0.69) {
      continue
    }

    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      mix(1.2, 3.1, random()),
      mixColor([0.018, 0.001, 0.006], [0.31, 0.006, 0.018], random() * 0.5),
      21,
      0.22,
      'mouth-cavity',
    )
    ids.push(id)
    const target = nearestNodeFromIds(nodes, point, [...innerUpper, ...innerLower], id)
    addEdge(edges, edgeKeys, nodes, id, target, 15)
  }

  for (let index = 0; index < tongueCount; index += 1) {
    const angle = random() * TAU
    const radius = Math.sqrt(random())
    const point = {
      x: Math.cos(angle) * 0.275 * radius,
      y: -0.745 + Math.sin(angle) * 0.082 * radius,
    }
    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      random() < 0.045 ? mix(5.2, 7.1, random()) : mix(1.45, 4.25, random()),
      mixColor([0.58, 0.004, 0.026], [1, 0.19, 0.035], 0.38 + random() * 0.62),
      21,
      mix(0.218, 0.235, random()),
      'mouth-tongue',
    )
    tongueIds.push(id)
    ids.push(id)
  }

  connectNearestNeighbours(nodes, edges, edgeKeys, tongueIds, 3, 0.085, 20)

  const tongueCurve: number[] = []

  for (let index = 0; index < tongueCurveCount; index += 1) {
    const progress = index / (tongueCurveCount - 1)
    const point = quadraticPoint(
      { x: -0.27, y: -0.69 },
      { x: 0, y: -0.735 },
      { x: 0.27, y: -0.69 },
      progress,
    )
    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      mix(2.1, 4.8, random()),
      mixColor([0.75, 0.018, 0.035], [1, 0.35, 0.055], 0.48 + random() * 0.52),
      21.5,
      0.238,
      'mouth-highlight',
    )
    tongueCurve.push(id)
    ids.push(id)
  }

  connectChain(nodes, edges, edgeKeys, tongueCurve, 27)

  for (let index = 0; index < tongueCurve.length; index += 3) {
    const curve = tongueCurve[index]
    const lower = innerLower[Math.floor((index / tongueCurve.length) * innerLower.length)]

    if (curve !== undefined && lower !== undefined) {
      addEdge(edges, edgeKeys, nodes, curve, lower, 21)
    }
  }

  const lipHighlights: number[] = []

  for (let index = 0; index < highlightCount; index += 1) {
    const lower = random() > 0.42
    const progress = random()
    const base = lower
      ? quadraticPoint(
          { x: -0.39, y: -0.52 },
          { x: 0, y: -0.865 },
          { x: 0.39, y: -0.52 },
          progress,
        )
      : quadraticPoint(
          { x: -0.39, y: -0.51 },
          { x: 0, y: -0.58 },
          { x: 0.39, y: -0.51 },
          progress,
        )
    const point = {
      x: base.x + mix(-0.012, 0.012, random()),
      y: base.y + mix(-0.012, 0.012, random()),
    }
    const id = addNode(
      nodes,
      random,
      'mouth',
      point,
      mix(1.35, 3.7, random()),
      mixColor([1, 0.45, 0.055], [1, 0.92, 0.48], random() * 0.72),
      20.5,
      0.245,
      'mouth-highlight',
    )
    lipHighlights.push(id)
    ids.push(id)
  }

  for (const highlightId of lipHighlights) {
    const highlight = nodes[highlightId]

    if (!highlight) {
      continue
    }

    const target = nearestNodeFromIds(
      nodes,
      highlight,
      [...outerUpper, ...outerLower, ...innerUpper, ...innerLower],
      highlightId,
    )
    addEdge(edges, edgeKeys, nodes, highlightId, target, 21)
  }

  for (const index of [0, Math.floor(outerUpper.length * 0.28), Math.floor(outerUpper.length * 0.72), outerUpper.length - 1]) {
    const anchor = outerUpper[index]

    if (anchor !== undefined) {
      anchors.push(anchor)
    }
  }

  anchors.push(outerLower[Math.floor(outerLower.length * 0.5)] ?? -1)

  return { ids, anchors: anchors.filter((id) => id >= 0) }
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
  const detailScale = clamp(nodeCount / 760, 0.42, 1)
  const desiredFlameCount = Math.max(140, Math.floor(nodeCount * 0.84))
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

  const desiredRimCount = Math.max(60, Math.floor(nodeCount * 0.15))
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
  const armCloudCount = Math.round(mix(28, 50, detailScale))

  for (const side of [-1, 1]) {
    const mainArm: number[] = []
    const start = { x: side * 0.66, y: -0.12 }
    const controlA = { x: side * 0.94, y: -0.02 }
    const controlB = { x: side * 1.12, y: 0.35 }
    const end = { x: side * 1.27, y: 0.68 }

    for (let index = 0; index < 22; index += 1) {
      const progress = index / 21
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

    for (let index = 0; index < armCloudCount; index += 1) {
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
      const mainTarget = mainArm[Math.min(mainArm.length - 1, Math.round(progress * 21))]

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

  const leftEye = addEye(
    nodes,
    edges,
    edgeKeys,
    random,
    {
      centerX: -0.305,
      centerY: -0.255,
      radiusX: 0.224,
      radiusY: 0.203,
      pupilOffsetX: 0.014,
      pupilOffsetY: -0.004,
      wobblePhase: 0.35,
    },
    detailScale,
  )
  const rightEye = addEye(
    nodes,
    edges,
    edgeKeys,
    random,
    {
      centerX: 0.295,
      centerY: -0.248,
      radiusX: 0.213,
      radiusY: 0.193,
      pupilOffsetX: -0.014,
      pupilOffsetY: -0.002,
      wobblePhase: 1.2,
    },
    detailScale,
  )
  const mouth = addMouth(nodes, edges, edgeKeys, random, detailScale)

  for (const faceAnchor of [...leftEye.anchors, ...rightEye.anchors, ...mouth.anchors]) {
    const faceNode = nodes[faceAnchor]

    if (!faceNode) {
      continue
    }

    const target = nearestNode(nodes, faceNode, new Set<GraphNodeRole>(['flame', 'rim']), faceAnchor)
    addEdge(edges, edgeKeys, nodes, faceAnchor, target, 13.5)
  }

  const sparkNodeIds: number[] = []
  const emberNodeIds: number[] = []
  const clusterCount = Math.max(14, Math.floor(nodeCount / 30))

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
    const rays = Math.floor(mix(6, 13, random()))

    for (let rayIndex = 0; rayIndex < rays; rayIndex += 1) {
      const rayAngle = random() * TAU
      const segments = random() < 0.38 ? 2 : 1
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

  const emberPairCount = Math.max(24, Math.floor(nodeCount / 10))

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

  return { nodes, edges }
}
