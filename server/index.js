import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import dotenv from 'dotenv'
import fetch from 'node-fetch'
// import OSS from 'ali-oss'
import { Readable } from 'stream'
import fs from 'fs'
import path from 'path'

dotenv.config()

// 创建日志目录
const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// 保存请求/响应JSON日志
function saveRequestLog(taskId, type, data) {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-')
    const filename = `${taskId}_${type}_${timestamp}.json`
    const filepath = path.join(logsDir, filename)
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8')
    console.log(`[LOG] 已保存 ${type} 日志: ${filename}`)
  } catch (error) {
    console.error(`[LOG] 保存日志失败:`, error.message)
  }
}

// 任务状态时间线记录
function pushTimeline(task, event, note) {
  const entry = { ts: new Date().toISOString(), event, note }
  task.timeline = Array.isArray(task.timeline) ? [...task.timeline, entry] : [entry]
  return task
}

function updateTask(taskId, patch) {
  const old = tasks.get(taskId)
  if (!old) return
  const next = { ...old, ...patch }
  tasks.set(taskId, next)
}

/**
 * ✅ 结构化提示词构建系统
 * 根据不同场景构建清晰、结构化的提示词
 */
function buildStructuredPrompt(options) {
  const { userPrompt, hasMask, maskElements, hasReference, referenceCount, resolution, coordRegions } = options
  
  const sections = []
  
  // 第1部分：任务定义
  sections.push('[任务定义]')
  sections.push('根据输入主图与用户需求生成高质量图像。')
  sections.push(`输出分辨率：${resolution}`)
  sections.push('')
  
  // 第2部分：输入图像说明
  sections.push('[输入图片]')
  sections.push('- 图1：主图（需要修改的原图）')
  if (hasReference) {
    for (let i = 0; i < referenceCount; i++) {
      sections.push(`- 图${i + 2}：参考图`)
    }
  }
  sections.push('')
  
  // 第3部分：用户需求
  sections.push('[用户需求]')
  // 如果包含多个蒙版区域指令，添加明确的分隔和编号
  if (userPrompt && userPrompt.includes('[蒙版中的')) {
    const regionPattern = /$$蒙版中的[^$$区域]需要[^;$$]+/g;
    const regions = userPrompt.match(regionPattern);
    
    if (regions && regions.length > 1) {
      // 多个区域，添加编号
      regions.forEach((region, index) => {
        sections.push(`${index + 1}. ${region}`);
      });
    } else {
      // 单个区域或非标准格式
      sections.push(userPrompt);
    }
  } else {
    sections.push(userPrompt);
  }
  sections.push('')

  // 第4部分：蒙版区域指令（如果有）
  if (hasMask && maskElements.length > 0) {
    const colorMap = {
      '#FF0000': 'red',
      '#00FF00': 'green',
      '#0000FF': 'blue',
      '#FFFF00': 'yellow',
      '#00FFFF': 'cyan',
      '#FF00FF': 'magenta',
      '#FFFFFF': 'white'
    }
    
    const colorGroups = new Set()
    maskElements.forEach(el => {
      const raw = el && typeof el.color === 'string' ? el.color : ''
      const key = raw ? raw.toUpperCase() : ''
      const colorName = colorMap[key] || (raw || 'white')
      colorGroups.add(colorName)
    })
    
    const maskColors = Array.from(colorGroups).join('、 ')
    
    sections.push('[蒙版区域 - 重要说明]')
    sections.push('⚠️ 已提供二值蒙版用于精确定义修改区域：')
    sections.push('- 白色区域：必须按照用户需求进行修改')
    sections.push('- 黑色区域：必须保持完全不变')
    sections.push(`- UI 中包含 ${maskElements.length} 个元素，标记颜色：${maskColors}`)
    sections.push('')
    sections.push('🎯 修改策略：')
    sections.push('1. 识别并仅在蒙版的白色区域进行修改')
    sections.push('2. 保持黑色区域与图1一致，不做任何改变')
    sections.push('3. 在修改与未修改区域之间进行自然融合')
    sections.push('4. 保持整体构图与光照一致性')
    
    // 添加针对具体区域的指令
    if (userPrompt && userPrompt.includes('[蒙版中的')) {
      const regionPattern = /$$蒙版中的([^$$]+)区域]需要(.+)/g;
      let match;
      const regionInstructions = [];
      
      while ((match = regionPattern.exec(userPrompt)) !== null) {
        const [, color, instruction] = match;
        regionInstructions.push(`- For ${color} mask region: ${instruction}`);
      }
      
      if (regionInstructions.length > 0) {
        sections.push('')
        sections.push('📝 具体区域说明：')
        regionInstructions.forEach(instruction => {
          sections.push(instruction);
        });
      }
    }
    
    sections.push('')
  }

  if (coordRegions && coordRegions.length > 0) {
    sections.push('[坐标区域]')
    coordRegions.forEach((r, i) => {
      const loc = `${r.type} @ ${r.desc}`
      const line = r.instruction
        ? `- 区域 ${i + 1}：${loc} -> ${r.instruction}`
        : `- 区域 ${i + 1}：${loc}`
      sections.push(line)
    })
    sections.push('')
    sections.push('基于坐标的修改仅影响所描述的区域，不得外溢。')
    sections.push('')
  }
  
  // 第5部分：质量要求
  sections.push('[质量要求]')
  sections.push('- 保持图像清晰与细节丰富')
  sections.push('- 维持自然光照与色彩一致性')
  sections.push('- 保持真实纹理与细节')
  sections.push('- 未修改区域保持与原图一致')
  if (hasMask) {
    sections.push('- 在蒙版与非蒙版区域之间创建平滑过渡')
    sections.push('- 严格遵守蒙版边界，避免渗漏')
  }
  sections.push('')
  
  // 第6部分：最终输出指导
  sections.push('[输出指导]')
  sections.push('生成一张完整的最终图片，其应当：')
  if (hasMask) {
    sections.push('1. 仅在蒙版白色区域按用户需求修改')
    sections.push('2. 保持所有黑色区域与原图一致')
    sections.push('3. 在修改与保留区域之间实现自然融合')
  } else {
    sections.push('1. 按用户需求整体变换图像')
    sections.push('2. 保持自然外观与整体一致性')
  }
  sections.push(`3. 输出分辨率精确为 ${resolution}`)
  sections.push('4. 保持专业级高质量效果')
  
  return sections.join('\n')
}

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(websocket)
await fastify.register(multipart, {
  limits: {
    fileSize: Infinity,  // 不限制文件大小
    files: 10  // 最多10个文件
  }
})

// 创建上传目录
const uploadsDir = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// 注册静态文件服务
await fastify.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/'
})

// OSS Client removed

// 验证生成图片URL可访问
async function waitForImageAccessible(url, retries = 10, delayMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      // 优先 HEAD，部分 CDN 不支持时回退 Range GET
      let res = await fetch(url, { method: 'HEAD' })
      let type = res.headers.get('content-type') || ''
      let len = Number(res.headers.get('content-length') || 0)
      if (!(res.ok && type.startsWith('image') && len > 0)) {
        // 回退：GET 1字节进行类型判断，避免大流量
        res = await fetch(url, { method: 'GET', headers: { 'Range': 'bytes=0-1' } })
        type = res.headers.get('content-type') || type
        len = Number(res.headers.get('content-length') || len)
      }
      if (res.ok && type.toLowerCase().includes('image')) {
        return true
      }
      console.warn(`[URL校验] 第${i + 1}次校验失败: status=${res.status}, type=${type}, length=${len}`)
    } catch (err) {
      console.warn(`[URL校验] 第${i + 1}次异常:`, (err && err.message) || String(err))
    }
    await new Promise(r => setTimeout(r, delayMs))
  }
  return false
}

function extFromContentType(ct = '') {
  const type = ct.toLowerCase()
  if (type.includes('jpeg')) return 'jpg'
  if (type.includes('jpg')) return 'jpg'
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  return 'jpg'
}

async function downloadImage(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载生成图片失败: ${res.status} ${res.statusText}`)
  const ct = res.headers.get('content-type') || 'image/jpeg'
  const ab = await res.arrayBuffer()
  const buf = Buffer.from(ab)
  return { buffer: buf, contentType: ct }
}

// uploadResultToOSS removed

async function ensureStoredResult(taskId, imageUrl) {
  // 1) 校验URL可访问
  const accessible = await waitForImageAccessible(imageUrl)
  saveRequestLog(taskId, 'result_validation', { imageUrl, accessible })
  if (!accessible) {
    console.warn('[RESULT校验] URL不可访问或未就绪，直接返回原始URL')
    return imageUrl
  }
  // 2) 下载并存储到本地
  try {
    console.log('[RESULT存储] 使用本地存储')
    const { buffer, contentType } = await downloadImage(imageUrl)
    const ext = extFromContentType(contentType)
    const filename = `result_${taskId}.${ext}`
    
    const uploadsDir = path.join(process.cwd(), 'uploads')
    const resultsDir = path.join(uploadsDir, 'results')
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true })
    }
    
    const filepath = path.join(resultsDir, filename)
    fs.writeFileSync(filepath, buffer)
    
    // 构建本地 URL
    // 我们需要一个基准URL。由于这是后端，我们不知道外部访问的域名。
    // 但是前端是连接到这个后端的。
    // 我们返回相对路径或者基于 PORT 的 localhost URL。
    const port = process.env.PORT || 3001
    // 使用相对路径 /uploads/... 如果前端和后端是同源的，或者后端代理。
    // 但通常返回绝对 URL 更安全。
    // 为了支持局域网访问，这里最好能获取到实际的 IP，但简化起见，我们使用 process.env.API_BASE_URL 如果有，或者 localhost
    const storedUrl = `http://localhost:${port}/uploads/results/${filename}`
    
    console.log('[RESULT存储] 本地存储成功:', storedUrl)
    return storedUrl

  } catch (err) {
    console.error('[RESULT存储] 失败，回退使用原始URL:', (err && err.message) || String(err))
    return imageUrl
  }
}

const tasks = new Map()

// 文件上传接口
fastify.post('/api/upload', async (request, reply) => {
  try {
    console.log('[UPLOAD] 收到文件上传请求')
    console.log('[UPLOAD] Headers:', request.headers['content-type'])
    
    const data = await request.file()
    if (!data) {
      console.error('[UPLOAD] 错误: 没有文件')
      return reply.code(400).send({ error: 'No file uploaded' })
    }

    console.log('[UPLOAD] 文件信息:', {
      filename: data.filename,
      mimetype: data.mimetype,
      encoding: data.encoding
    })

    const buffer = await data.toBuffer()
    const filename = `${process.env.OSS_ROOT_PREFIX || 'test'}/${Date.now()}_${data.filename}`
    console.log('[UPLOAD] 文件名:', filename, '大小:', buffer.length, 'bytes', `(${(buffer.length / 1024 / 1024).toFixed(2)} MB)`)

    // 验证 OSS 配置
    // OSS 逻辑已移除
    
    let publicUrl
    
    // 使用本地存储
    console.log('[UPLOAD] 使用本地存储')
    const localFilename = `${Date.now()}_${data.filename}`
    const localFilepath = path.join(uploadsDir, localFilename)
    fs.writeFileSync(localFilepath, buffer)
    
    const protocol = request.protocol
    const host = request.hostname
    // 注意：request.hostname 可能不包含端口，如果前端连接的是 localhost:3001，hostname 可能是 localhost
    // 如果是开发环境，通常没问题。
    publicUrl = `${protocol}://${host}/uploads/${localFilename}`
    console.log('[UPLOAD] 本地存储成功:', localFilepath)

    console.log('[UPLOAD] 返回 URL:', publicUrl)

    reply.send({ 
      url: publicUrl,
      filename: data.filename,
      size: buffer.length
    })
  } catch (error) {
    console.error('[UPLOAD] 上传失败 - 错误类型:', error.name)
    console.error('[UPLOAD] 上传失败 - 错误信息:', error.message)
    console.error('[UPLOAD] 上传失败 - 错误堆栈:', error.stack)
    reply.code(500).send({ error: error.message, type: error.name })
  }
})

// 提交生成任务
fastify.post('/api/submit', async (request, reply) => {
  const payload = request.body
  const taskId = `job_${Date.now()}`
  
  console.log('[==== 接收前端请求 ====]')
  console.log(`[任务ID] ${taskId}`)
  console.log('[请求时间]', new Date().toISOString())
  console.log('[完整Payload]', JSON.stringify(payload, null, 2))
  console.log('[请求参数解析]')
  console.log('  - 输出分辨率:', payload.global_params?.output_resolution)
  console.log('  - 主图 URL:', payload.base_image)
  console.log('  - 标注坐标: 使用坐标标签（不再使用蒙版）')
  console.log('  - 提示词:', payload.prompt)
  console.log('  - 参考图数量:', payload.materials?.length || 0)
  
  // 保存请求日志
  saveRequestLog(taskId, 'request', payload)
  console.log('[==== 请求解析完成 ====]')
  
  // 参数校验
  const resStr = payload?.global_params?.output_resolution
  const baseImage = payload?.base_image
  const promptText = payload?.prompt
  const validRes = typeof resStr === 'string' && /^\d+x\d+$/.test(resStr)
  if (!validRes || !baseImage || !promptText) {
    console.warn('[SUBMIT] 参数校验失败', { validRes, baseImage: !!baseImage, prompt: !!promptText })
    saveRequestLog(taskId, 'submit_invalid', { payload })
    reply.code(400).send({ error: 'Invalid payload: require base_image, prompt, and global_params.output_resolution' })
    return
  }

  tasks.set(taskId, pushTimeline({
    id: taskId,
    status: 'PENDING',
    payload,
    createdAt: Date.now(),
    result: null,
    error: null,
    timeline: []
  }, 'submit_received', '收到前端提交'))

  // 异步处理任务
  processTask(taskId, payload).catch(err => {
    console.error('[SUBMIT] 任务处理错误:', err)
    const t = tasks.get(taskId)
    tasks.set(taskId, pushTimeline({ ...t, status: 'FAILED', error: err.message }, 'failed', err.message))
  })

  console.log('[SUBMIT] 任务已创建，返回 taskId:', taskId)
  reply.send({ taskId, status: 'PENDING' })
})

// 查询任务状态
fastify.get('/api/task/:taskId', async (request, reply) => {
  const { taskId } = request.params
  const task = tasks.get(taskId)
  
  console.log(`[查询任务] ${taskId} - 状态: ${task?.status || '不存在'}`)
  
  if (!task) {
    console.warn(`[查询任务] 任务不存在: ${taskId}`)
    reply.code(404).send({ error: 'Task not found' })
    return
  }

  reply.send({
    id: task.id,
    status: task.status,
    payload: task.payload,
    createdAt: task.createdAt,
    result: task.result,
    error: task.error,
    timeline: task.timeline || []
  })
})

// 健康检查
fastify.get('/api/health', async (request, reply) => {
  const stats = { total: tasks.size, complete: 0, processing: 0, failed: 0 }
  for (const [, t] of tasks) {
    if (t.status === 'COMPLETE') stats.complete++
    else if (t.status === 'PROCESSING') stats.processing++
    else if (t.status === 'FAILED') stats.failed++
  }
  reply.send({ ok: true, port: process.env.PORT || 3001, stats })
})

// Helper to convert local URL to Base64
function convertLocalUrlToBase64(url) {
  try {
    if (!url) return url
    // Check if it's a local URL (localhost or relative)
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.startsWith('/uploads/')) {
      const filename = url.split('/').pop()
      const uploadsDir = path.join(process.cwd(), 'uploads')
      const filepath = path.join(uploadsDir, filename)
      
      if (fs.existsSync(filepath)) {
        const buffer = fs.readFileSync(filepath)
        // Simple mime type detection
        const ext = path.extname(filename).toLowerCase()
        let mimeType = 'image/jpeg'
        if (ext === '.png') mimeType = 'image/png'
        else if (ext === '.webp') mimeType = 'image/webp'
        
        const base64 = buffer.toString('base64')
        console.log(`[Base64] Converted local file ${filename} to base64 (${base64.length} chars)`)
        return `data:${mimeType};base64,${base64}`
      }
    }
    return url
  } catch (e) {
    console.error(`[Base64] Failed to convert ${url}:`, e.message)
    return url
  }
}

// 处理任务（对接 Nano banana2 pro）
async function processTask(taskId, payload, retryCount = 0) {
  const MAX_RETRIES = 3
  const RETRY_DELAY = 2000
  const REQUEST_TIMEOUT = 30000
  
  console.log(`[TASK ${taskId}] 开始处理任务 (尝试 ${retryCount + 1}/${MAX_RETRIES + 1})`)
  
  const task = tasks.get(taskId)
  tasks.set(taskId, pushTimeline({ ...task, status: 'PROCESSING' }, 'processing_start', '开始处理'))

  const apiKey = process.env.NANO_API_KEY
  const apiBase = process.env.NANO_API_BASE || 'https://api.apimart.ai'
  console.log(`[TASK ${taskId}] API Base:`, apiBase)
  console.log(`[TASK ${taskId}] API Key:`, apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET')

  // Mock 模式：仅在显式启用时返回占位图片结果
  if (process.env.NANO_MOCK === '1') {
    console.warn(`[TASK ${taskId}] API Key 未设置或启用 NANO_MOCK，使用本地Mock结果`)
    const seed = taskId.replace(/[^0-9]/g, '') || String(Date.now())
    const mockUrl = `https://picsum.photos/seed/${seed}/1024/576`
    const storedUrl = await ensureStoredResult(taskId, mockUrl)
    const t = tasks.get(taskId)
    tasks.set(taskId, pushTimeline({ ...t, status: 'COMPLETE', result: storedUrl }, 'complete', 'Mock结果'))
    saveRequestLog(taskId, 'ai_mock_response', { taskId, url: storedUrl })
    return
  }
  if (!apiKey) {
    throw new Error('NANO_API_KEY not set')
  }

  // 计算图片比例
  const [width, height] = (payload.global_params?.output_resolution || '3840x2160').split('x').map(Number)
  const aspectRatio = width / height
  let size = '16:9' // 默认
  
  // 计算最接近的比例
  const ratios = {
    '1:1': 1, '2:3': 2/3, '3:2': 3/2, '3:4': 3/4, '4:3': 4/3,
    '4:5': 4/5, '5:4': 5/4, '9:16': 9/16, '16:9': 16/9, '21:9': 21/9
  }
  let minDiff = Infinity
  for (const [key, value] of Object.entries(ratios)) {
    const diff = Math.abs(value - aspectRatio)
    if (diff < minDiff) {
      minDiff = diff
      size = key
    }
  }
  console.log(`[TASK ${taskId}] 分辨率: ${width}x${height}, 比例: ${size}`)

  // 确定分辨率等级
  const maxDim = Math.max(width, height)
  let resolution = '4K'
  if (maxDim <= 1024) resolution = '1K'
  else if (maxDim <= 2048) resolution = '2K'
  console.log(`[TASK ${taskId}] 输出分辨率等级: ${resolution}`)

  // ===== 提示词转换处理 =====
  console.log(`\n[TASK ${taskId}] ========== 提示词转换开始 ==========`)
  console.log(`[TASK ${taskId}] [原始提示词] ${payload.prompt || '(空)'}`)
  
  let processedPrompt = payload.prompt || ''
  const replacementLog = [] // 记录所有替换操作
  
  // ✅ 第1步：替换参考图占位符 @文件名 -> 图N
  if (payload.reference_assets && payload.reference_assets.length > 0) {
  console.log(`[TASK ${taskId}] [步骤1] 处理参考图引用 (${payload.reference_assets.length}个)`) 
    payload.reference_assets.forEach((asset, index) => {
      const imageNumber = index + 2  // 主图是第1张，参考图从第2张开始
      const regex = new RegExp(`@${asset.id}`, 'g')
      const replacement = `图${imageNumber}`  // ✅ 改为中文"图N"
      const beforeReplace = processedPrompt
      processedPrompt = processedPrompt.replace(regex, replacement)
      if (beforeReplace !== processedPrompt) {
        const log = `@${asset.id} → ${replacement}`
        replacementLog.push(log)
        console.log(`[TASK ${taskId}]   ✓ ${log}`)
      }
    })
  } else {
    console.log(`[TASK ${taskId}] [步骤1] 无参考图引用`)
  }

  // 解析 @形状标签（@矩形一/@圆形二/@画笔三），映射为坐标区域
  function parseShapeLabels(text, elements) {
    const regions = []
    const consumed = []
    const labelRe = /@?(矩形|圆形|画笔)(一|二|三|四|五|六|七|八|九|十|\d+)/g
    let m
    const nameIndex = new Map()
    if (Array.isArray(elements)) {
      elements.forEach(el => {
        if (el.name) nameIndex.set(el.name, el)
      })
    }
    while ((m = labelRe.exec(text)) !== null) {
      const label = `${m[1]}${m[2]}`
      const el = nameIndex.get(label)
      if (!el) continue
      let desc = ''
      if (el.type === 'rectangle' && Array.isArray(el.coords) && el.coords.length === 8) {
        desc = `${el.coords[0]},${el.coords[1]};${el.coords[2]},${el.coords[3]};${el.coords[4]},${el.coords[5]};${el.coords[6]},${el.coords[7]}`
        regions.push({ type: 'rectangle', desc, instruction: '' })
      } else if (el.type === 'brush' && Array.isArray(el.coords) && el.coords.length >= 4) {
        const pairs = []
        for (let i = 0; i < el.coords.length; i += 2) {
          pairs.push(`${el.coords[i]},${el.coords[i+1]}`)
        }
        desc = pairs.join(';')
        regions.push({ type: 'polygon', desc, instruction: '' })
      }
      consumed.push(m[0])
      replacementLog.push(`@${label} → ${el.type} coords`)
    }
    let cleaned = text
    consumed.forEach(seg => { cleaned = cleaned.replace(seg, '') })
    return { regions, cleaned }
  }

  const labelParse = parseShapeLabels(processedPrompt, payload.mask_elements)
  if (labelParse.regions.length > 0) {
    labelParse.regions.forEach((r, i) => {
      const log = `@label ${r.type} ${r.desc}`
      replacementLog.push(log)
      console.log(`[TASK ${taskId}]   ✓ ${log}`)
    })
    processedPrompt = labelParse.cleaned.trim()
  }

  // 解析 @rect/@circle/@point/@poly 坐标标签，返回区域数组与清理后的提示词
  function parseCoordinateTags(text) {
    const regions = []
    const consumed = []
    // 支持矩形的四角坐标：@rect(x1,y1,x2,y2,x3,y3,x4,y4)
    const rect8Re = /@?rect\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*:?[\s]*([^@\n]*)/gi
    const rectRe = /@?rect\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*:?[\s]*([^@\n]*)/gi
    const lineRe = /@line\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*:?[\s]*([^@\n]*)/gi
    const circleRe = /@circle\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*:?[\s]*([^@\n]*)/gi
    const pointRe = /@point\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*:?[\s]*([^@\n]*)/gi
    const polyRe = /@poly\(\s*([^)]+)\)\s*:?[\s]*([^@\n]*)/gi
    let m
    while ((m = rect8Re.exec(text)) !== null) {
      const xs = [Number(m[1]), Number(m[3]), Number(m[5]), Number(m[7])]
      const ys = [Number(m[2]), Number(m[4]), Number(m[6]), Number(m[8])]
      const instr = (m[9] || '').trim()
      const desc = `${xs[0]},${ys[0]};${xs[1]},${ys[1]};${xs[2]},${ys[2]};${xs[3]},${ys[3]}`
      regions.push({ type: 'rectangle', desc, instruction: instr })
      consumed.push(m[0])
    }
    while ((m = rectRe.exec(text)) !== null) {
      const x = Number(m[1]); const y = Number(m[2]); const w = Number(m[3]); const h = Number(m[4])
      const instr = (m[5] || '').trim()
      const desc = `${x},${y};${x+w},${y};${x+w},${y+h};${x},${y+h}`
      regions.push({ type: 'rectangle', desc, instruction: instr })
      consumed.push(m[0])
    }
    while ((m = lineRe.exec(text)) !== null) {
      const x1 = Number(m[1]); const y1 = Number(m[2]); const x2 = Number(m[3]); const y2 = Number(m[4])
      const instr = (m[5] || '').trim()
      regions.push({ type: 'line', desc: `${x1},${y1}→${x2},${y2}`, instruction: instr })
      consumed.push(m[0])
    }
    while ((m = circleRe.exec(text)) !== null) {
      const cx = Number(m[1]); const cy = Number(m[2]); const r = Number(m[3])
      const instr = (m[4] || '').trim()
      regions.push({ type: 'circle', desc: `${cx},${cy},r=${r}`, instruction: instr })
      consumed.push(m[0])
    }
    while ((m = pointRe.exec(text)) !== null) {
      const px = Number(m[1]); const py = Number(m[2])
      const instr = (m[3] || '').trim()
      regions.push({ type: 'point', desc: `${px},${py}`, instruction: instr })
      consumed.push(m[0])
    }
    while ((m = polyRe.exec(text)) !== null) {
      const coords = (m[1] || '').trim().replace(/\s+/g, '')
      const instr = (m[2] || '').trim()
      regions.push({ type: 'polygon', desc: coords, instruction: instr })
      consumed.push(m[0])
    }
    let cleaned = text
    consumed.forEach(seg => {
      cleaned = cleaned.replace(seg, '')
    })
    return { regions, cleaned }
  }

  const coordParse = parseCoordinateTags(processedPrompt)
  if (coordParse.regions.length > 0) {
    coordParse.regions.forEach((r, i) => {
      const log = `@coord ${r.type} ${r.desc} → ${r.instruction || '(no instruction)'}`
      replacementLog.push(log)
      console.log(`[TASK ${taskId}]   ✓ ${log}`)
    })
    processedPrompt = coordParse.cleaned.trim()
  }
  
  // ✅ 第2步：已移除蒙版颜色相关处理，统一依赖坐标标签
  console.log(`[TASK ${taskId}] [步骤2] 无蒙版处理，保留坐标标注`)
  
  // ✅ 第3步：取消旧版 #mask_N 占位符处理
  console.log(`[TASK ${taskId}] [步骤3] 未进行 mask_N 占位符处理`)
  
  // 打印转换摘要
  console.log(`[TASK ${taskId}] [转换摘要]`)
  console.log(`[TASK ${taskId}]   - 原始提示词: "${payload.prompt}"`)
  console.log(`[TASK ${taskId}]   - 处理后提示词: "${processedPrompt}"`)
  console.log(`[TASK ${taskId}]   - 替换操作数: ${replacementLog.length}`)
  if (replacementLog.length > 0) {
    console.log(`[TASK ${taskId}]   - 替换详情:`)
    replacementLog.forEach((log, i) => {
      console.log(`[TASK ${taskId}]     ${i + 1}. ${log}`)
    })
  }
  console.log(`[TASK ${taskId}] ========== 提示词转换完成 ==========\n`)
  
  // ✅ 结构化提示词（仅基于坐标标注与参考素材）
  const structuredPrompt = buildStructuredPrompt({
    userPrompt: processedPrompt,
    hasMask: false,
    maskElements: [],
    hasReference: !!(payload.reference_assets && payload.reference_assets.length > 0),
    referenceCount: (payload.reference_assets || []).length,
    resolution: `${width}x${height}`,
    coordRegions: coordParse.regions || []
  })
  
  console.log(`[TASK ${taskId}] ==== 结构化提示词 ====`)
  console.log(structuredPrompt)
  console.log(`[TASK ${taskId}] ==== 结构化完成 ====`)
  
  const requestBody = {
    model: 'gemini-3-pro-image-preview',
    prompt: structuredPrompt,  // ✅ 使用结构化提示词
    size,
    resolution,
    n: 1
  }

  // 添加图片 URL（主图 + 参考图）
  const imageUrls = []
  
  // ✅ 第1张图：主图（base_image）
  if (payload.base_image) {
    const base64Url = convertLocalUrlToBase64(payload.base_image)
    imageUrls.push({ url: base64Url })
    console.log(`[TASK ${taskId}] 主图 (image 1): ${payload.base_image} -> ${base64Url.startsWith('data:') ? 'Base64 (' + base64Url.length + ' chars)' : base64Url}`)
  }
  
  // ✅ 第2,3,4...张图：参考图（reference_assets）
  if (payload.reference_assets && payload.reference_assets.length > 0) {
    payload.reference_assets.forEach((asset, index) => {
      const base64Url = convertLocalUrlToBase64(asset.url)
      imageUrls.push({ url: base64Url })
      console.log(`[TASK ${taskId}] 参考图 (image ${index + 2}): ${asset.url} -> ${base64Url.startsWith('data:') ? 'Base64 (' + base64Url.length + ' chars)' : base64Url}`)
    })
  }
  
  if (imageUrls.length > 0) {
    requestBody.image_urls = imageUrls
    console.log(`[TASK ${taskId}] 总图片数量: ${imageUrls.length}`)
  }

  // ⛔ 已移除所有与蒙版相关的请求体设置与日志
  
  // ⛔ 已移除将蒙版信息融入提示词的逻辑

  console.log(`[TASK ${taskId}] 完整请求体:`, JSON.stringify(requestBody, null, 2))
  
  // ========== AI接口请求参数完整输出 ==========
  console.log(`\n[TASK ${taskId}] ========== AI接口请求参数 ==========`)
  console.log(`[TASK ${taskId}] [关键字段概览]`)
  console.log(`[TASK ${taskId}]   - model: ${requestBody.model}`)
  console.log(`[TASK ${taskId}]   - size (比例): ${requestBody.size}`)
  console.log(`[TASK ${taskId}]   - resolution (等级): ${requestBody.resolution}`)
  console.log(`[TASK ${taskId}]   - n (生成数量): ${requestBody.n}`)
  console.log(`[TASK ${taskId}]   - image_urls: ${requestBody.image_urls ? `✅ ${requestBody.image_urls.length}张` : '❌ 未设置'}`)
  // 已移除 mask_url 字段
  
  console.log(`[TASK ${taskId}] [image_urls 详细信息]`)
  if (requestBody.image_urls && requestBody.image_urls.length > 0) {
    requestBody.image_urls.forEach((img, i) => {
      const urlPreview = img.url.length > 80 ? img.url.substring(0, 80) + '...' : img.url
      console.log(`[TASK ${taskId}]   图片${i + 1}: ${urlPreview}`)
    })
  } else {
    console.log(`[TASK ${taskId}]   (无图片)`)
  }
  
  // 移除 mask_url 详细信息输出
  
  console.log(`[TASK ${taskId}] [prompt 完整内容]`)
  console.log(`[TASK ${taskId}] --- PROMPT START (${requestBody.prompt?.length || 0} 字符) ---`)
  console.log(requestBody.prompt)
  console.log(`[TASK ${taskId}] --- PROMPT END ---`)
  console.log(`[TASK ${taskId}] ========== 请求参数输出完毕 ==========\n`)
  
  // ✅ 验证请求体完整性
  console.log('[==== 请求体验证 ====]')
  console.log(`[TASK ${taskId}] model: ${requestBody.model ? '✅' : '❌'} ${requestBody.model}`)
  console.log(`[TASK ${taskId}] prompt: ${requestBody.prompt ? '✅' : '❌'} (${requestBody.prompt?.length || 0} 字符)`)
  console.log(`[TASK ${taskId}] size: ${requestBody.size ? '✅' : '❌'} ${requestBody.size}`)
  console.log(`[TASK ${taskId}] resolution: ${requestBody.resolution ? '✅' : '❌'} ${requestBody.resolution}`)
  console.log(`[TASK ${taskId}] image_urls: ${requestBody.image_urls ? '✅' : '❌'} (${requestBody.image_urls?.length || 0} 张)`)
  // 移除 mask_url 验证输出
  console.log('[==== 验证完成 ====]')
  
  // ✅ 保存向AI接口发送的请求日志
  saveRequestLog(taskId, 'ai_request', {
    taskId,
    timestamp: new Date().toISOString(),
    apiEndpoint: `${apiBase}/v1/images/generations`,
    originalPayload: payload,
    apiRequestBody: requestBody
  })
  
  console.log('[==== 发送AI请求 ====]')
  updateTask(taskId, pushTimeline(tasks.get(taskId), 'api_request_sent', '已发送到AI接口'))
  console.log(`[TASK ${taskId}] 目标接口: ${apiBase}/v1/images/generations`)
  console.log(`[TASK ${taskId}] 请求方法: POST`)
  console.log(`[TASK ${taskId}] 请求头: Authorization: Bearer ${apiKey?.substring(0, 10)}...`)

  try {
    // 创建超时控制器
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
    
    console.log(`[TASK ${taskId}] 发送请求到 API...`)
    const response = await fetch(`${apiBase}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    })
    
    clearTimeout(timeout)
    console.log(`[TASK ${taskId}] API 响应状态: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error(`[TASK ${taskId}] API 错误响应:`, errorText)
      throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    
    console.log('[==== AI接口响应 ====]')
    console.log(`[TASK ${taskId}] 响应状态: ${response.status} ${response.statusText}`)
    console.log(`[TASK ${taskId}] 响应数据:`, JSON.stringify(result, null, 2))
    
    // ✅ 保存AI接口响应日志
    saveRequestLog(taskId, 'ai_submit_response', {
      taskId,
      timestamp: new Date().toISOString(),
      status: response.status,
      response: result
    })
    console.log('[==== AI响应已保存日志 ====]')
    
    // API 返回的是 task_id，需要轮询查询结果
    const apiTaskId = result.data?.[0]?.task_id || result.data?.task_id || result.data?.id
    if (!apiTaskId) {
      console.error(`[TASK ${taskId}] API 响应结构:`, result)
      throw new Error('未能获取 API task_id')
    }
    
    console.log(`[TASK ${taskId}] API 返回 task_id: ${apiTaskId}，开始轮询查询结果...`)
    updateTask(taskId, pushTimeline(tasks.get(taskId), 'api_task_id_received', String(apiTaskId)))
    
    // 轮询查询任务结果
    const pollResult = async () => {
      for (let i = 0; i < 60; i++) {  // 最多轮询60次，共120秒
        await new Promise(resolve => setTimeout(resolve, 2000))  // 每2秒查询1次
        
        console.log(`[TASK ${taskId}] 查询任务状态 (第 ${i + 1} 次)...`)
        // 正确的查询 API endpoint
        const statusResponse = await fetch(`${apiBase}/v1/tasks/${apiTaskId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        })
        
        if (!statusResponse.ok) {
          console.error(`[TASK ${taskId}] 查询任务失败: ${statusResponse.status}`)
          continue
        }
        
        const statusResult = await statusResponse.json()
        console.log(`[TASK ${taskId}] 任务状态响应:`, JSON.stringify(statusResult, null, 2))
        
        // 兼容两种响应格式：data 为数组或对象
        const taskData = Array.isArray(statusResult.data) ? statusResult.data[0] : statusResult.data
        const taskStatus = taskData?.status
        
        console.log(`[TASK ${taskId}] 解析状态: ${taskStatus}`)
        
        // ✅ 保存轮询响应日志（每10次或终态保存一次）
        if (i % 10 === 0 || taskStatus === 'completed' || taskStatus === 'failed') {
          saveRequestLog(taskId, `ai_poll_${i + 1}`, {
            taskId,
            timestamp: new Date().toISOString(),
            pollCount: i + 1,
            status: taskStatus,
            response: statusResult
          })
          console.log(`[TASK ${taskId}] 轮询日志已保存 (${i + 1})`)
        }
        
        if (taskStatus === 'completed' || taskStatus === 'success') {
          // 多种 URL 获取方式，完全兼容 API 响应结构
          let imageUrl = null
          
          // 方式1: result.images[0].url[0] (Nano banana2 实际格式)
          if (taskData?.result?.images?.[0]?.url) {
            const urlData = taskData.result.images[0].url
            imageUrl = Array.isArray(urlData) ? urlData[0] : urlData
          }
          
          // 方式2: url 字段 (直接在 taskData 中)
          if (!imageUrl && taskData?.url) {
            imageUrl = Array.isArray(taskData.url) ? taskData.url[0] : taskData.url
          }
          
          // 方式3: image_url 字段
          if (!imageUrl && taskData?.image_url) {
            imageUrl = Array.isArray(taskData.image_url) ? taskData.image_url[0] : taskData.image_url
          }
          
          if (!imageUrl) {
            console.error(`[TASK ${taskId}] 任务完成但未找到图片 URL:`, taskData)
            throw new Error('任务完成但未返回图片 URL')
          }
          
          console.log(`[TASK ${taskId}] 任务完成，图片 URL:`, imageUrl)
          updateTask(taskId, pushTimeline(tasks.get(taskId), 'polling_complete', String(imageUrl)))
          return imageUrl
        } else if (taskStatus === 'failed' || taskStatus === 'error') {
          let errorMsg = 'Unknown error'
          if (taskData?.error) {
            errorMsg = typeof taskData.error === 'object' ? JSON.stringify(taskData.error) : taskData.error
          } else if (taskData?.message) {
            errorMsg = taskData.message
          }
          throw new Error(`API 任务失败: ${errorMsg}`)
        }
        
        console.log(`[TASK ${taskId}] 任务状态: ${taskStatus}，继续等待...`)
      }
      throw new Error('轮询超时，任务未完成')
    }
    
    const resultUrl = await pollResult()
    console.log(`[TASK ${taskId}] 最终结果 URL(原始):`, resultUrl)
    const storedUrl = await ensureStoredResult(taskId, resultUrl)
    console.log(`[TASK ${taskId}] 最终结果 URL(存储):`, storedUrl)
    
    const t2 = tasks.get(taskId)
    tasks.set(taskId, pushTimeline({ ...t2, status: 'COMPLETE', result: storedUrl }, 'complete', '结果已校验并存储'))
  } catch (error) {
    console.error(`[TASK ${taskId}] 错误 (尝试 ${retryCount + 1}/${MAX_RETRIES + 1}):`, error.message)
    console.error(`[TASK ${taskId}] 错误堆栈:`, error.stack)
    
    // 判断是否需要重试（503、超时、网络错误）
    const shouldRetry = (
      error.message.includes('503') || 
      error.message.includes('timeout') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ETIMEDOUT') ||
      error.name === 'AbortError'
    ) && retryCount < MAX_RETRIES
    
    if (shouldRetry) {
      console.log(`[TASK ${taskId}] 将在 ${RETRY_DELAY * (retryCount + 1)}ms 后重试...`)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)))
      return processTask(taskId, payload, retryCount + 1)
    }
    
    // 最终失败：仅在显式允许时回退到Mock；默认标记失败
    if (process.env.ALLOW_FAILOVER_TO_MOCK === '1' || process.env.NANO_MOCK === '1') {
      console.warn(`[TASK ${taskId}] 任务最终失败，回退到Mock结果并进行存储流程`)
      const seed = taskId.replace(/[^0-9]/g, '') || String(Date.now())
      const mockUrl = `https://picsum.photos/seed/${seed}/1024/576`
      const storedUrl = await ensureStoredResult(taskId, mockUrl)
      const t3 = tasks.get(taskId)
      tasks.set(taskId, pushTimeline({ ...t3, status: 'COMPLETE', result: storedUrl, error: null, retryCount }, 'mock_fallback', '失败回退Mock'))
      saveRequestLog(taskId, 'ai_mock_fallback', { taskId, originalUrl: mockUrl, storedUrl, error: error.message })
    } else {
      const t4 = tasks.get(taskId)
      tasks.set(taskId, pushTimeline({ ...t4, status: 'FAILED', result: null, error: error.message, retryCount }, 'failed', error.message))
      saveRequestLog(taskId, 'ai_task_failed', { taskId, error: error.message })
    }
  }
}

// WebSocket 进度推送
fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    connection.socket.on('message', message => {
      const { taskId } = JSON.parse(message.toString())
      
      const interval = setInterval(() => {
        const task = tasks.get(taskId)
        if (!task) {
          clearInterval(interval)
          return
        }

        connection.socket.send(JSON.stringify({
          taskId: task.id,
          status: task.status,
          result: task.result,
          error: task.error
        }))

        if (task.status === 'COMPLETE' || task.status === 'FAILED') {
          clearInterval(interval)
        }
      }, 1000)

      connection.socket.on('close', () => clearInterval(interval))
    })
  })
})

const PORT = process.env.PORT || 3001
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  console.log(`Server running at http://localhost:${PORT}`)
})
