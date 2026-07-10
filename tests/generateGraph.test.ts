import assert from 'node:assert/strict'
import test from 'node:test'
import { createPresentationGraph } from '../src/scripts/graph/createPresentationGraph'

const expectedRoles = new Set([
  'flame',
  'rim',
  'arm',
  'eye',
  'pupil',
  'mouth',
  'spark',
  'ember',
])

const countBy = <T extends string>(values: T[]): Map<T, number> => {
  const counts = new Map<T, number>()

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return counts
}

test('graph generation is deterministic for a fixed seed', () => {
  const first = createPresentationGraph({ nodeCount: 180, seed: 42 })
  const second = createPresentationGraph({ nodeCount: 180, seed: 42 })

  assert.deepEqual(first.nodes, second.nodes)
  assert.deepEqual(first.edges, second.edges)
})

test('graph contains the reference-matched body, face and detached fire systems', () => {
  const graph = createPresentationGraph({ nodeCount: 180, seed: 7 })
  const roles = new Set(graph.nodes.map((node) => node.role))
  const degree = new Uint16Array(graph.nodes.length)
  const roleCounts = countBy(graph.nodes.map((node) => node.role))

  for (const edge of graph.edges) {
    degree[edge.source] = (degree[edge.source] ?? 0) + 1
    degree[edge.target] = (degree[edge.target] ?? 0) + 1
  }

  assert.ok(graph.nodes.length >= 1100)
  assert.deepEqual(roles, expectedRoles)
  assert.ok((roleCounts.get('flame') ?? 0) >= 140)
  assert.ok((roleCounts.get('rim') ?? 0) >= 60)
  assert.ok((roleCounts.get('arm') ?? 0) >= 100)
  assert.ok((roleCounts.get('eye') ?? 0) >= 340)
  assert.ok((roleCounts.get('pupil') ?? 0) >= 56)
  assert.ok((roleCounts.get('mouth') ?? 0) >= 220)
  assert.ok((roleCounts.get('spark') ?? 0) >= 130)
  assert.ok((roleCounts.get('ember') ?? 0) >= 48)
  assert.ok(Array.from(degree).every((value) => value > 0))
  assert.ok(graph.nodes.some((node) => node.size >= 12))
  assert.ok(graph.nodes.some((node) => node.size <= 1.5))
  assert.ok(graph.nodes.every((node) => node.x >= -2.2 && node.x <= 2.2))
  assert.ok(graph.nodes.every((node) => node.y >= -1.25 && node.y <= 1.9))
})

test('eyes use dense annular sclera, bright iris spokes and compact black pupils', () => {
  const graph = createPresentationGraph({ nodeCount: 220, seed: 2026 })
  const featureCounts = countBy(
    graph.nodes.flatMap((node) => (node.feature === undefined ? [] : [node.feature])),
  )
  const leftEye = graph.nodes.filter(
    (node) => (node.role === 'eye' || node.role === 'pupil') && node.x < 0,
  )
  const rightEye = graph.nodes.filter(
    (node) => (node.role === 'eye' || node.role === 'pupil') && node.x > 0,
  )
  const pupils = graph.nodes.filter((node) => node.feature === 'eye-pupil')
  const highlights = graph.nodes.filter((node) => node.feature === 'eye-highlight')

  assert.ok((featureCounts.get('eye-outer-rim') ?? 0) >= 70)
  assert.ok((featureCounts.get('eye-sclera') ?? 0) >= 200)
  assert.ok((featureCounts.get('eye-iris') ?? 0) >= 44)
  assert.ok((featureCounts.get('eye-highlight') ?? 0) >= 18)
  assert.ok((featureCounts.get('eye-pupil') ?? 0) >= 56)
  assert.ok(leftEye.length > 180)
  assert.ok(rightEye.length > 180)
  assert.ok(leftEye.every((node) => node.y > -0.5 && node.y < -0.02))
  assert.ok(rightEye.every((node) => node.y > -0.5 && node.y < -0.02))
  assert.ok(pupils.every((node) => node.color[0] < 0.01 && node.color[1] < 0.01))
  assert.ok(highlights.every((node) => node.color[0] > 0.98 && node.color[1] > 0.98))
})

test('mouth keeps a dark open cavity with a luminous double rim and lower tongue', () => {
  const graph = createPresentationGraph({ nodeCount: 220, seed: 2026 })
  const featureCounts = countBy(
    graph.nodes.flatMap((node) => (node.feature === undefined ? [] : [node.feature])),
  )
  const cavity = graph.nodes.filter((node) => node.feature === 'mouth-cavity')
  const tongue = graph.nodes.filter((node) => node.feature === 'mouth-tongue')
  const highlights = graph.nodes.filter((node) => node.feature === 'mouth-highlight')
  const mouthNodes = graph.nodes.filter((node) => node.role === 'mouth')

  assert.ok((featureCounts.get('mouth-outer-rim') ?? 0) >= 70)
  assert.ok((featureCounts.get('mouth-inner-rim') ?? 0) >= 60)
  assert.ok((featureCounts.get('mouth-cavity') ?? 0) >= 6)
  assert.ok((featureCounts.get('mouth-tongue') ?? 0) >= 45)
  assert.ok((featureCounts.get('mouth-highlight') ?? 0) >= 42)
  assert.ok(cavity.every((node) => node.color[0] < 0.32 && node.color[1] < 0.02))
  assert.ok(tongue.every((node) => node.y < -0.65 && node.y > -0.84))
  assert.ok(highlights.some((node) => node.color[0] > 0.98 && node.color[1] > 0.45))
  assert.ok(mouthNodes.some((node) => node.x < -0.4))
  assert.ok(mouthNodes.some((node) => node.x > 0.4))
  assert.ok(mouthNodes.some((node) => node.y < -0.84))
})

test('all edges reference valid distinct nodes', () => {
  const graph = createPresentationGraph({ nodeCount: 220, seed: 2026 })

  for (const edge of graph.edges) {
    assert.notEqual(edge.source, edge.target)
    assert.ok(edge.source >= 0 && edge.source < graph.nodes.length)
    assert.ok(edge.target >= 0 && edge.target < graph.nodes.length)
    assert.ok(edge.restLength > 0)
    assert.ok(edge.stiffness > 0)
  }
})
