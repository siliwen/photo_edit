/**
 * 上传文件到后端 OSS
 * @param file 文件对象
 * @returns 返回公开访问的 URL
 */
export async function uploadToOSS(file: File): Promise<string> {
  console.log('[前端上传] 开始上传文件:', file.name, '大小:', file.size, 'bytes')
  
  const formData = new FormData()
  formData.append('file', file)

  try {
    const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001'
    console.log('[前端上传] 发送请求到', `${API_BASE}/api/upload`)
    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    })

    console.log('[前端上传] 响应状态:', response.status, response.statusText)

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      console.error('[前端上传] 服务器返回错误:', error)
      throw new Error(error.error || 'Upload failed')
    }

    const result = await response.json()
    console.log('[前端上传] 上传成功，返回 URL:', result.url)
    return result.url
  } catch (error) {
    console.error('[前端上传] 上传异常:', error)
    throw error
  }
}

/**
 * 将 DataURL 转换为 File 对象
 */
export function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

/**
 * 上传 DataURL 格式的图片
 */
export async function uploadDataURL(dataURL: string, filename: string): Promise<string> {
  const file = dataURLtoFile(dataURL, filename)
  return uploadToOSS(file)
}
