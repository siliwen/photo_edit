import { useAppStore } from '../store'
import { describe, it, expect } from 'vitest'

describe('输出尺寸状态', () => {
  it('setOutputResolution 更新 store', () => {
    const s = useAppStore.getState()
    s.setOutputResolution('1024x768')
    expect(useAppStore.getState().outputResolution).toBe('1024x768')
    s.setOutputResolution('800x600')
    expect(useAppStore.getState().outputResolution).toBe('800x600')
  })
})
