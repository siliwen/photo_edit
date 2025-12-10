import { isValidRectTag, isValidCircleTag, elementRect, elementCircle } from '../components/cards/PromptAndModelCard'

import { describe, it, expect } from 'vitest'

describe('坐标标签校验', () => {
  it('rect 格式正确', () => {
    expect(isValidRectTag('@rect(0,0,10,10)')).toBe(true)
    expect(isValidRectTag('@rect(12,34,567,890)')).toBe(true)
  })

  it('rect 格式错误', () => {
    expect(isValidRectTag('@rect(0,0,10)')).toBe(false)
    expect(isValidRectTag('@rect(a,b,c,d)')).toBe(false)
    expect(isValidRectTag('@rect(1,2,3,4 ')).toBe(false)
  })

  it('circle 格式正确', () => {
    expect(isValidCircleTag('@circle(0,0,10)')).toBe(true)
    expect(isValidCircleTag('@circle(123,456,789)')).toBe(true)
  })

  it('circle 格式错误', () => {
    expect(isValidCircleTag('@circle(0,0)')).toBe(false)
    expect(isValidCircleTag('@circle(a,b,c)')).toBe(false)
    expect(isValidCircleTag('@circle(1,2,3 ')).toBe(false)
  })
})

describe('点集换算为坐标', () => {
  it('elementRect 计算包围盒', () => {
    const pts = [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 25, y: 35 }]
    const r = elementRect(pts)
    expect(r).toEqual({ x: 10, y: 20, w: 20, h: 20 })
  })

  it('elementCircle 计算圆参数', () => {
    const pts = [{ x: 50, y: 50 }, { x: 60, y: 50 }]
    const c = elementCircle(pts)
    expect(c).toEqual({ cx: 50, cy: 50, r: 10 })
  })
})
