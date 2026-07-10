import assert from 'node:assert/strict'
import test from 'node:test'
import { createCalciferGraph } from '../src/scripts/graph/generateGraph'

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

test('graph generation is deterministic for a fixed seed', () => {
  const first = createCalciferGraph({ nodeCount: 180, seed: 42 })
  const second = createCalciferGraph({ nodeCount: 180, seed: 42 })

  assert.deepEqual(first.nodes, second.nodes)
  assert.deepEqual(first.edges, second.edges)
})

test('graph contains the reference-matched face, contour, arms and detached fire', () => {
  const graph = createCalciferGraph({ nodeCount: 180, seed: 7 })
  const roles = new Set(graph.nodes.map((node) => node.role))
  const degree = new Uint16Array(graph.nodes.length)
  const roleCounts = new Map<string, number>()

  for (const node of graph.nodes) {
    roleCounts.set(node.role, (roleCounts.get(node.role) ?? 0) + 1)
  }

  for (const edge of graph.edges) {
    degree[edge.source] = (degree[edge.source] ?? 0) + 1
    degree[edge.target] = (degree[edge.target] ?? 0) + 1
  }

  assert.ok(graph.nodes.length >= 850)
  assert.deepEqual(roles, expectedRoles)
  assert.ok((roleCounts.get('flame') ?? 0) >= 180)
  assert.ok((roleCounts.get('rim') ?? 0) >= 80)
  assert.ok((roleCounts.get('arm') ?? 0) >= 140)
  assert.ok((roleCounts.get('eye') ?? 0) >= 220)
  assert.ok((roleCounts.get('pupil') ?? 0) >= 36)
  assert.ok((roleCounts.get('mouth') ?? 0) >= 170)
  assert.ok((roleCounts.get('spark') ?? 0) >= 150)
  assert.ok((roleCounts.get('ember') ?? 0) >= 68)
  assert.ok(Array.from(degree).every((value) => value > 0))
  assert.ok(graph.nodes.some((node) => node.size >= 12))
  assert.ok(graph.nodes.some((node) => node.size <= 2))
  assert.ok(graph.nodes.every((node) => node.x >= -2.2 && node.x <= 2.2))
  assert.ok(graph.nodes.every((node) => node.y >= -1.25 && node.y <= 1.9))
})

test('facial landmarks remain large, bright and spatially separated', () => {
  const graph = createCalciferGraph({ nodeCount: 220, seed: 2026 })
  const leftEye = graph.nodes.filter((node) => node.role === 'eye' && node.x < 0)
  const rightEye = graph.nodes.filter((node) => node.role === 'eye' && node.x > 0)
  const pupils = graph.nodes.filter((node) => node.role === 'pupil')
  const mouth = graph.nodes.filter((node) => node.role === 'mouth')

  assert.ok(leftEye.length > 100)
  assert.ok(rightEye.length > 100)
  assert.ok(leftEye.every((node) => node.y > -0.48 && node.y < -0.02))
  assert.ok(rightEye.every((node) => node.y > -0.48 && node.y < -0.02))
  assert.ok(pupils.every((node) => node.color[0] < 0.02 && node.color[1] < 0.02))
  assert.ok(mouth.some((node) => node.y < -0.78))
})

test('all edges reference valid distinct nodes', () => {
  const graph = createCalciferGraph({ nodeCount: 220, seed: 2026 })

  for (const edge of graph.edges) {
    assert.notEqual(edge.source, edge.target)
    assert.ok(edge.source >= 0 && edge.source < graph.nodes.length)
    assert.ok(edge.target >= 0 && edge.target < graph.nodes.length)
    assert.ok(edge.restLength > 0)
    assert.ok(edge.stiffness > 0)
  }
})
