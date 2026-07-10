import assert from 'node:assert/strict'
import test from 'node:test'
import { createCalciferGraph } from '../src/scripts/graph/generateGraph'

test('graph generation is deterministic for a fixed seed', () => {
  const first = createCalciferGraph({ nodeCount: 180, seed: 42 })
  const second = createCalciferGraph({ nodeCount: 180, seed: 42 })

  assert.deepEqual(first.nodes, second.nodes)
  assert.deepEqual(first.edges, second.edges)
})

test('graph contains a connected flame, face and arms', () => {
  const graph = createCalciferGraph({ nodeCount: 180, seed: 7 })
  const roles = new Set(graph.nodes.map((node) => node.role))
  const degree = new Uint16Array(graph.nodes.length)

  for (const edge of graph.edges) {
    degree[edge.source] = (degree[edge.source] ?? 0) + 1
    degree[edge.target] = (degree[edge.target] ?? 0) + 1
  }

  assert.ok(graph.nodes.length >= 170)
  assert.deepEqual(roles, new Set(['flame', 'arm', 'eye', 'pupil', 'mouth']))
  assert.ok(Array.from(degree).every((value) => value > 0))
  assert.ok(graph.nodes.every((node) => node.x >= -1.3 && node.x <= 1.3))
  assert.ok(graph.nodes.every((node) => node.y >= -1 && node.y <= 1.2))
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
