import { describe, expect, it } from 'vitest'
import { mainBranchPath, subBranchPath, tint, topicKind, type SubBranchParams } from './branchPath'
import { mergeLook, readLook } from './nodeStyles'

// Parent wrapper at x 100–200 (topic 130–170 with a 30px gap), child wrapper at x 200–300.
const base: SubBranchParams = { pT: 0, pL: 100, pW: 100, pH: 40, cT: 100, cL: 200, cW: 100, cH: 40, direction: 'rhs', isFirst: false }
const GAP = 30

describe('topicKind', () => {
  it('classifies styles', () => {
    expect(topicKind(undefined)).toBeNull()
    expect(topicKind({ color: 'red' })).toBeNull()
    // A border set to "none" means: no box and no underline either.
    expect(topicKind({ border: 'none', background: 'transparent', borderRadius: '999px' })).toBe('box')
    expect(topicKind({ background: 'transparent', borderRadius: '999px' })).toBeNull()
    expect(topicKind({ border: '2px solid red' })).toBe('box')
    expect(topicKind({ background: '#fff' })).toBe('box')
    expect(topicKind({ border: 'none', borderBottom: '2px solid red' })).toBe('underline')
  })
})

describe('subBranchPath', () => {
  it('underlines unstyled children, like the engine', () => {
    expect(subBranchPath(base, GAP, undefined, undefined)).toMatch(/^M 170 40 C 200 40 [\d.]+ 140 230 140 H 270$/)
  })

  it('joins boxed children at the middle of their side, without an underline', () => {
    const path = subBranchPath(base, GAP, { kind: 'box', top: 106, left: 230, width: 40, height: 28 }, undefined)
    expect(path).toMatch(/ 230 120$/)
    expect(path).not.toContain('H')
  })

  it('ends at the start of a custom underline', () => {
    const path = subBranchPath(base, GAP, { kind: 'underline', top: 106, left: 230, width: 40, height: 28 }, undefined)
    expect(path).toMatch(/ 230 134$/)
    expect(path).not.toContain('H')
  })

  it('starts from the middle of boxed parents and first-level topics', () => {
    expect(subBranchPath(base, GAP, undefined, 'box')).toMatch(/^M 170 20 /)
    // First-level topics have no padding: start right at their edge, not inside.
    expect(subBranchPath({ ...base, isFirst: true }, GAP, undefined, undefined)).toMatch(/^M 200 20 /)
    expect(subBranchPath(base, GAP, undefined, 'underline')).toMatch(/^M 170 40 /)
  })

  it('starts at the outer edge of first-level topics on the left side too', () => {
    const lhs = { ...base, pL: 300, cL: 200, direction: 'lhs', isFirst: true }
    expect(subBranchPath(lhs, GAP, undefined, undefined)).toMatch(/^M 300 20 /)
  })

  it('mirrors on the left side', () => {
    const lhs = { ...base, pL: 300, cL: 200, direction: 'lhs' }
    expect(subBranchPath(lhs, GAP, undefined, undefined)).toMatch(/^M 330 40 C 300 40 [\d.]+ 140 270 140 H 230$/)
    expect(subBranchPath(lhs, GAP, { kind: 'box', top: 106, left: 230, width: 40, height: 28 }, undefined)).toMatch(/ 270 120$/)
  })
})

describe('tint', () => {
  it('mixes colors with white', () => {
    expect(tint('#000000', 0.25)).toBe('#bfbfbf')
    expect(tint('#ffffff')).toBe('#ffffff')
    expect(tint('not-a-color')).toBe('#fdeccd')
  })
})

describe('shapes without a border', () => {
  it('get a fill so the shape is visible', () => {
    expect(mergeLook(readLook(), { shape: 'pill' }).fill).toBe('solid')
    expect(mergeLook(readLook({ border: 'none' }), { shape: 'rounded' }).fill).toBe('solid')
  })

  it('keep the fill the user chose, and outlined shapes stay unfilled', () => {
    expect(mergeLook(readLook(), { shape: 'pill', fill: 'none' }).fill).toBe('none')
    expect(mergeLook(readLook({ border: '2px solid red' }), { shape: 'pill' }).fill).toBe('default')
    expect(mergeLook(readLook({ borderRadius: '999px' }), { fill: 'default' }).fill).toBe('default')
  })
})

describe('mainBranchPath', () => {
  // Center topic at x 100–300, y 0–60.
  const root = { pT: 0, pL: 100, pW: 200, pH: 60 }

  it('leaves the center topic from the middle of its side, never from inside it', () => {
    const right = mainBranchPath({ ...root, cT: 200, cL: 400, cW: 80, cH: 30, direction: 'rhs' })
    expect(right).toMatch(/^M 300 30 C /)
    expect(right).toMatch(/ 400 215$/)
    const left = mainBranchPath({ ...root, cT: -100, cL: -50, cW: 80, cH: 30, direction: 'lhs' })
    expect(left).toMatch(/^M 100 30 C /)
    expect(left).toMatch(/ 30 -85$/)
  })
})

describe('line options', () => {
  it('draws straight and elbow connectors', () => {
    expect(subBranchPath(base, GAP, undefined, undefined, { style: 'straight' })).toMatch(/^M 170 40 L 230 140 H 270$/)
    const elbow = subBranchPath(base, GAP, undefined, undefined, { style: 'elbow' })
    expect(elbow).toMatch(/^M 170 40 H /)
    expect(elbow).toContain(' V ')
    expect(elbow).toMatch(/ H 230 H 270$/)
    const main = mainBranchPath({ pT: 0, pL: 100, pW: 200, pH: 60, cT: 200, cL: 400, cW: 80, cH: 30, direction: 'rhs' }, { style: 'elbow' })
    expect(main).toMatch(/^M 300 30 H /)
    expect(main).toMatch(/ H 400$/)
  })

  it('hides connectors but keeps plain topics\' underlines', () => {
    expect(subBranchPath(base, GAP, undefined, undefined, { hidden: true })).toBe('M 230 140 H 270')
    expect(subBranchPath(base, GAP, { kind: 'box', top: 106, left: 230, width: 40, height: 28 }, undefined, { hidden: true })).toBe('')
    expect(mainBranchPath({ pT: 0, pL: 100, pW: 200, pH: 60, cT: 200, cL: 400, cW: 80, cH: 30, direction: 'rhs' }, { hidden: true })).toBe('')
  })
})
