import assert from 'node:assert/strict'
import test from 'node:test'
import { createCalciferGraph } from '../src/scripts/graph/generateGraph'
import { createDragInfluence, createPhysicsState, stepGraphPhysics } from '../src/scripts/graph/physics'

test('anchor force returns a displaced node toward its target', () => {
  const graph = createCalciferGraph({ nodeCount: 80, seed: 3 })
  const state = createPhysicsState(graph)
  const node = state.nodes[0]

  if (!node) {
    throw new Error('Expected at least one physics node')
  }

  node.x += 0.8
  const initialDistance = Math.abs(node.x - node.targetX)

  for (let step = 0; step < 180; step += 1) {
    stepGraphPhysics(state, graph.edges, step / 60, 1 / 60)
  }

  assert.ok(Math.abs(node.x - node.targetX) < initialDistance)
})

test('drag influence decays over graph distance', () => {
  const graph = createCalciferGraph({ nodeCount: 140, seed: 9 })
  const source = graph.edges[0]?.source
  const target = graph.edges[0]?.target

  assert.notEqual(source, undefined)
  assert.notEqual(target, undefined)

  const influence = createDragInfluence(graph.nodes.length, graph.edges, source ?? 0)

  assert.equal(influence[source ?? 0], 1)
  assert.ok((influence[target ?? 0] ?? 0) > 0)
  assert.ok((influence[target ?? 0] ?? 0) < 1)
})

test('dragged node is pinned to the pointer target', () => {
  const graph = createCalciferGraph({ nodeCount: 100, seed: 11 })
  const state = createPhysicsState(graph)

  stepGraphPhysics(state, graph.edges, 1, 1 / 60, {
    draggedIndex: 0,
    draggedX: 0.91,
    draggedY: -0.73,
  })

  assert.equal(state.nodes[0]?.x, 0.91)
  assert.equal(state.nodes[0]?.y, -0.73)
})
