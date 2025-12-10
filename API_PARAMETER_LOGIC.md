# API参数传递逻辑说明

## 🎯 核心原则

### 1. 图片顺序编号规则

API接收的图片按以下顺序排列：
- **第1张图片**：原图（base_image）
- **第2张图片**：第一个参考图（reference_assets[0]）
- **第3张图片**：第二个参考图（reference_assets[1]）
- **第N+1张图片**：第N个参考图（reference_assets[N-1]）

### 2. 蒙版信息构造

**❌ 错误方式（使用@符号）：**
```
Mask region 1: 
- description: "Replace logo"
- action: generate content
- reference: @ref_176518832916117_0  ❌ AI无法理解@符号
```

**✅ 正确方式（使用图片序号）：**
```
In mask region 1: Replace logo, use image 2 as reference, generate content
```

### 3. 提示词组织

**最终发送给API的prompt格式：**
```
{用户输入的原始提示词}

In mask region 1: {蒙版1的描述}, use image {图片序号} as reference, {动作类型}
In mask region 2: {蒙版2的描述}, {动作类型}
```

---

## 📝 实际示例

### 场景：替换Logo

**用户操作：**
1. 上传主图（背景图）
2. 上传参考图1（新Logo）
3. 在主图上绘制蒙版圈选旧Logo位置
4. 配置蒙版：
   - 描述：Replace the tree logo with new logo
   - 动作：generation
   - 关联参考图：ref_xxx（新Logo）

**后端生成的请求：**
```json
{
  "model": "gemini-3-pro-image-preview",
  "prompt": "Keep the background, replace only the logo area\n\nIn mask region 1: Replace the tree logo with new logo, use image 2 as reference, generate content",
  "size": "16:9",
  "resolution": "4K",
  "image_urls": [
    {
      "url": "https://podi.oss-cn-hangzhou.aliyuncs.com/test/logo.png"
    }
  ],
  "mask_url": "https://podi.oss-cn-hangzhou.aliyuncs.com/test/mask_xxx.png"
}
```

**图片顺序：**
- 第1张：主图（背景图）
- 第2张：参考图1（新Logo）
- 蒙版：圈选旧Logo位置

**提示词解释：**
- `In mask region 1`: 在蒙版区域1
- `Replace the tree logo with new logo`: 用户描述
- `use image 2 as reference`: 使用第2张图片（新Logo）作为参考
- `generate content`: 生成内容

---

## 🔍 日志文件说明

每次提交任务都会在 `server/logs/` 目录生成以下日志文件：

1. **`{taskId}_request_{timestamp}.json`** - 完整请求体
   ```json
   {
     "taskId": "job_1765186789123",
     "timestamp": "2025-12-08T10-30-00.000Z",
     "originalPayload": { /* 前端发送的原始数据 */ },
     "apiRequestBody": { /* 发送给API的最终请求 */ }
   }
   ```

2. **`{taskId}_submit_response_{timestamp}.json`** - API提交响应
   ```json
   {
     "taskId": "job_1765186789123",
     "timestamp": "2025-12-08T10-30-01.000Z",
     "status": 200,
     "response": { /* API返回的task_id等 */ }
   }
   ```

3. **`{taskId}_poll_{count}_{timestamp}.json`** - 轮询状态响应（每10次或完成时保存）
   ```json
   {
     "taskId": "job_1765186789123",
     "timestamp": "2025-12-08T10-30-15.000Z",
     "pollCount": 10,
     "status": "processing",
     "response": { /* 任务状态信息 */ }
   }
   ```

---

## ⚠️ 常见问题排查

### 问题1：生成的结果是参考图本身

**可能原因：**
- 蒙版区域太大，覆盖了整个图片
- 提示词没有明确指示"保留背景"
- 没有正确关联参考图

**排查步骤：**
1. 查看 `request.json`，检查蒙版描述是否清晰
2. 检查提示词是否包含 `use image X as reference`
3. 检查蒙版区域是否准确

### 问题2：蒙版区域之外的内容也被修改

**可能原因：**
- 蒙版尺寸与原图不一致（已修复，强制1:1）
- AI理解错误，需要更明确的提示词

**建议：**
- 提示词中明确说明"only in mask region"
- 使用更精确的蒙版描述

### 问题3：看不到日志文件

**检查：**
```bash
ls -la server/logs/
```

如果目录为空，说明后端没有成功启动或任务未执行。

---

## 📊 优化建议

### 提示词最佳实践

1. **保留背景：**
   ```
   Keep the original background unchanged, only modify the mask region
   ```

2. **精确描述动作：**
   ```
   In mask region 1: Replace the old logo with the new logo design from image 2, maintain the same size and position
   ```

3. **多蒙版协作：**
   ```
   Background photo of a desk

   In mask region 1: Place a cat from image 2 on the table, generate content
   In mask region 2: Remove the person in the background, remove object
   ```

---

## 🎓 技术细节

### 图片上传顺序保证

前端上传参考图时会自动生成ID（如 `ref_176518832916117_0`），后端通过 `referenceLink` 字段查找对应的参考图：

```javascript
// 查找关联的参考图
if (mask.referenceLink) {
  const refAsset = payload.reference_assets.find(a => a.id === mask.referenceLink)
  if (refAsset) {
    const refIndex = payload.reference_assets.indexOf(refAsset)
    const imageNumber = refIndex + 2  // 原图是第1张，参考图从第2张开始
    parts.push(`use image ${imageNumber} as reference`)
  }
}
```

### 蒙版信息构造逻辑

```javascript
const parts = []

// 1. 用户描述（最重要）
if (mask.description) {
  parts.push(mask.description)
}

// 2. 参考图关联
parts.push(`use image ${imageNumber} as reference`)

// 3. 动作类型
parts.push('generate content')  // 或 'remove object', 'apply style'

// 4. 其他参数（仅非默认值）
if (mask.strength !== 1) {
  parts.push(`strength ${mask.strength}`)
}

// 最终：In mask region 1: {parts.join(', ')}
```

---

**日期：** 2025-12-08  
**版本：** Phase 2 完成后修复
