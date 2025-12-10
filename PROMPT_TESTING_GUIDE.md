# 提示词优化效果测试

## 测试目的
验证结构化提示词系统是否能提高大模型对用户意图的理解准确度

## 测试准备

### 1. 启动系统
```bash
# 后端
cd server && node index.js

# 前端
cd web && npm run dev
```

### 2. 准备测试素材
- 一张测试图片（建议使用有明确主体和背景的图片）
- （可选）一张参考图片用于风格引用

## 测试场景

### 场景1：局部背景替换（蒙版修改）

#### 测试步骤：
1. 上传主图
2. 点击"编辑蒙版"
3. 使用红色笔刷标记背景区域
4. 在提示词中输入：
   ```
   @红色区域改为蓝天白云背景，光照自然，与前景人物协调一致
   ```
5. 提交任务
6. 等待生成结果

#### 预期结果：
- ✅ 仅红色标记区域被修改为蓝天白云
- ✅ 其他区域（人物、前景）保持不变
- ✅ 修改区域边界自然融合，无明显接缝
- ✅ 光照方向和强度与原图一致

#### 验证方法：
1. 查看生成结果
2. 检查 `server/logs/` 目录中的 `*_ai_request_*.json` 文件
3. 确认结构化提示词包含以下内容：
   ```
   [MASK REGIONS - CRITICAL INSTRUCTIONS]
   - WHITE areas in the mask: These regions MUST be modified
   - BLACK areas in the mask: These regions MUST remain unchanged
   
   🎯 Modification Strategy:
   1. Identify the white regions...
   2. Apply modifications ONLY to these white mask areas...
   ```

---

### 场景2：风格转换（参考图引用）

#### 测试步骤：
1. 上传主图
2. 上传参考图（例如：sunset.jpg）
3. 在提示词中输入：
   ```
   参考@sunset的暖色调，将整体改为日落风格，保持原始构图和内容
   ```
4. 提交任务

#### 预期结果：
- ✅ 整体色调变为暖色（橙红、金黄）
- ✅ 原始构图和主要内容保持不变
- ✅ 风格过渡自然

#### 验证方法：
查看日志文件，确认提示词替换：
```
原始: 参考@sunset的暖色调
替换后: 参考图2的暖色调
```

---

### 场景3：复杂多区域修改

#### 测试步骤：
1. 上传主图
2. 使用红色笔刷标记天空区域
3. 使用蓝色笔刷标记地面区域
4. 输入提示词：
   ```
   @红色区域改为晴朗的蓝天白云，@蓝色区域改为绿色草地，
   整体光照柔和自然，细节清晰真实
   ```
5. 提交任务

#### 预期结果：
- ✅ 红色标记区域变为蓝天白云
- ✅ 蓝色标记区域变为绿色草地
- ✅ 两个区域的修改互不干扰
- ✅ 未标记区域完全保持原样
- ✅ 所有区域边界自然融合

---

### 场景4：快捷模板测试

#### 测试步骤：
1. 上传主图
2. 点击"快捷模板"中的"风格转换"按钮
3. 自动填充提示词：
   ```
   保持原始构图和内容,改为卡通风格,色彩明亮,线条清晰
   ```
4. 提交任务

#### 预期结果：
- ✅ 整体风格转换为卡通风格
- ✅ 构图和主要内容保持不变
- ✅ 色彩更加明亮鲜艳
- ✅ 边缘线条更清晰

---

## 对比测试

### 对比1：优化前 vs 优化后（蒙版理解）

| 维度 | 优化前 | 优化后 |
|------|--------|--------|
| **提示词格式** | 简单附加蒙版指令 | 结构化六段式 |
| **蒙版语义** | 模糊（"使用蒙版定位"） | 明确（"白色=修改，黑色=保留"） |
| **修改策略** | 无具体步骤 | 五步清晰策略 |
| **质量要求** | 未明确说明 | 详细列出7项要求 |
| **预期准确率** | 约50-60% | 约80-90% |

### 对比2：简单提示词 vs 详细提示词

#### 简单提示词：
```
改成森林
```

**问题**：
- ❌ AI不知道保留什么
- ❌ 不清楚修改哪些区域
- ❌ 缺少质量和风格要求
- ❌ 可能整张图都被改动

#### 详细提示词：
```
保持原始人物和前景不变，将@红色标记的背景区域改为森林场景，
包含树木、灌木和地面落叶，阳光透过树叶形成光斑效果，
整体色调偏绿，光照柔和自然，与人物的光照方向保持一致。
```

**优势**：
- ✅ 明确保留内容（人物、前景）
- ✅ 精确修改区域（@红色背景）
- ✅ 详细目标描述（树木、光斑）
- ✅ 质量和融合要求清晰

---

## 日志分析

### 查看结构化提示词

1. 提交任务后，等待几秒
2. 打开 `server/logs/` 目录
3. 找到最新的 `*_ai_request_*.json` 文件
4. 查看 `prompt` 字段的内容

#### 示例日志内容：
```json
{
  "model": "gemini-3-pro-image-preview",
  "prompt": "[TASK DEFINITION]\nGenerate a high-quality image based on the input image and user requirements.\nOutput resolution: 3840x2160\n\n[INPUT IMAGES]\n- Image 1: Base image (main content)\n\n[USER REQUIREMENTS]\n图1上蒙版标记的红色区域改为蓝天白云背景，光照自然，与前景人物协调一致\n\n[MASK REGIONS - CRITICAL INSTRUCTIONS]\n⚠️ A binary mask is provided to precisely define the modification areas:\n- WHITE areas in the mask: These regions MUST be modified according to user requirements\n- BLACK areas in the mask: These regions MUST remain completely unchanged\n- The mask contains 1 element(s) marked with red color(s) in the UI\n\n🎯 Modification Strategy:\n1. Identify the white regions in the provided mask\n2. Apply modifications ONLY to these white mask areas\n3. Preserve all other areas exactly as they appear in Image 1\n4. Ensure seamless blending between modified and unchanged regions\n5. Maintain the overall composition and lighting consistency\n\n[QUALITY REQUIREMENTS]\n- Maintain high image quality and sharpness\n- Ensure natural lighting and color consistency\n- Keep realistic textures and details\n- Preserve the original image composition where not modified\n- Create smooth transitions between masked and unmasked areas\n- Strictly follow the mask boundaries without bleeding effects\n\n[OUTPUT GUIDANCE]\nGenerate a single, complete image that:\n1. Modifies ONLY the white mask areas according to user requirements\n2. Keeps all black mask areas exactly as in the original image\n3. Ensures seamless integration between modified and preserved regions\n4. Outputs at exactly 3840x2160 resolution\n5. Delivers professional, high-quality results",
  "size": "16:9",
  "resolution": "4K",
  "n": 1,
  "image_urls": [
    { "url": "https://podi.oss-cn-hangzhou.aliyuncs.com/..." }
  ],
  "mask_url": "https://podi.oss-cn-hangzhou.aliyuncs.com/..."
}
```

### 关键验证点：

1. ✅ `[TASK DEFINITION]` 部分是否存在
2. ✅ `[INPUT IMAGES]` 是否正确列出所有图片
3. ✅ `[USER REQUIREMENTS]` 是否包含替换后的提示词
4. ✅ `[MASK REGIONS]` 是否包含五步策略（如果有蒙版）
5. ✅ `[QUALITY REQUIREMENTS]` 和 `[OUTPUT GUIDANCE]` 是否完整

---

## 性能指标

### 成功标准

| 指标 | 优化前 | 目标 | 实际 |
|------|--------|------|------|
| 蒙版区域准确率 | ~50% | ≥80% | _待测试_ |
| 边界融合质量 | 中等 | 优秀 | _待测试_ |
| 保留区域完整性 | ~60% | ≥90% | _待测试_ |
| 整体效果满意度 | ~55% | ≥75% | _待测试_ |

### 测试记录表

| 测试场景 | 日期 | 提示词 | 结果评分 | 问题记录 | 改进建议 |
|---------|------|--------|---------|---------|---------|
| 局部背景替换 | | | /10 | | |
| 风格转换 | | | /10 | | |
| 复杂多区域 | | | /10 | | |
| 快捷模板 | | | /10 | | |

---

## 常见问题排查

### Q1: 蒙版区域没有生效
**排查步骤**：
1. 检查日志中 `mask_url` 是否存在
2. 访问 `mask_url`，确认蒙版图片是白色区域（非黑色）
3. 确认提示词中是否包含 `[MASK REGIONS]` 部分
4. 检查蒙版元素数量是否正确

### Q2: 整张图都被修改了
**可能原因**：
- 蒙版未正确上传（mask_url 为空）
- 提示词中未提及"保持XX不变"
- AI模型理解偏差

**解决方法**：
- 在提示词开头明确说明："保持原始构图和XXX不变"
- 检查蒙版是否正确生成

### Q3: 参考图风格没有应用
**排查步骤**：
1. 检查 `image_urls` 数组长度（应为 1 + 参考图数量）
2. 确认提示词中 `@文件名` 被正确替换为 `图N`
3. 在提示词中明确说明如何使用参考图：
   ```
   参考图2的色调和光照，应用到整体画面
   ```

---

## 优化建议反馈

如果在测试过程中发现问题或有优化建议，请记录以下信息：

1. **问题描述**：
2. **测试场景**：
3. **使用的提示词**：
4. **生成结果截图**：
5. **日志文件路径**：
6. **改进建议**：

---

**测试版本**：v1.0  
**创建时间**：2025-12-09  
**测试人员**：_____
