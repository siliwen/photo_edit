import { describe, it, expect } from 'vitest'

// 直接从 SubmitBar 中复制逻辑进行验证（保持与实现一致）
const toRect = (pts: Array<{ x: number; y: number }>) => {
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  const minX = Math.round(Math.min(...xs))
  const minY = Math.round(Math.min(...ys))
  const maxX = Math.round(Math.max(...xs))
  const maxY = Math.round(Math.max(...ys))
  const w = Math.max(1, maxX - minX)
  const h = Math.max(1, maxY - minY)
  return `@rect(${minX},${minY},${w},${h})`
}
const toCircle = (pts: Array<{ x: number; y: number }>) => {
  const p1 = pts[0]
  const p2 = pts[pts.length - 1]
  const cx = Math.round(p1.x)
  const cy = Math.round(p1.y)
  const r = Math.max(1, Math.round(Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))))
  return `@circle(${cx},${cy},${r})`
}

describe('坐标标签生成', () => {
  it('矩形/画笔生成 rect 标签', () => {
    const brushPts = [{ x: 10, y: 10 }, { x: 20, y: 30 }, { x: 15, y: 25 }]
    const rectPts = [{ x: 100, y: 120 }, { x: 400, y: 360 }]
    expect(toRect(brushPts)).toBe('@rect(10,10,10,20)')
    expect(toRect(rectPts)).toBe('@rect(100,120,300,240)')
  })

  it('圆形生成 circle 标签', () => {
    const circlePts = [{ x: 50, y: 50 }, { x: 60, y: 50 }]
    expect(toCircle(circlePts)).toBe('@circle(50,50,10)')
  })
})
