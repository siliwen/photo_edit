// 测试改进后的提示词转换逻辑
const fs = require('fs');
const path = require('path');

// 模拟颜色映射表
const colorMap = {
  '#FF0000': '红色',
  '#00FF00': '绿色',
  '#0000FF': '蓝色',
  '#FFFF00': '黄色',
  '#00FFFF': '青色',
  '#FF00FF': '品红',
  '#FFFFFF': '白色'
};

// 改进后的提示词处理函数
function processPrompt(prompt, maskElements) {
  let processedPrompt = prompt || '';
  const replacementLog = [];
  
  if (maskElements && maskElements.length > 0) {
    // 按颜色分组
    const colorGroups = new Set();
    maskElements.forEach(el => {
      const colorName = colorMap[el.color.toUpperCase()] || el.color;
      colorGroups.add(colorName);
    });
    
    console.log(`检测到的颜色: ${Array.from(colorGroups).join(', ')}`);
    
    // 🎯 新格式：@颜色 XXX -> [蒙版中的XXX区域]需要XXX
    // 按颜色顺序处理，保证按顺序替换
    const colorOrder = Array.from(colorGroups);
    const replacements = [];
    
    colorOrder.forEach(colorName => {
      // 匹配模式：@颜色 后面跟着的内容（直到下一个@或结尾）
      const regex = new RegExp(`@${colorName}\\s+([^@]+?)(?=\\s*@|$)`, 'g');
      
      processedPrompt = processedPrompt.replace(regex, (match, content) => {
        const trimmedContent = content.trim();
        if (trimmedContent) {
          // 清理描述语言，移除冗余词汇
          let cleanedContent = trimmedContent
            .replace(/这个形象的/g, '')
            .replace(/这一形象的/g, '')
            .replace(/这种形象/g, '')
            .replace(/统一/g, '')
            .trim();
          
          // 标准化动词：变成/换成 -> 替换为
          cleanedContent = cleanedContent
            .replace(/变成/g, '替换为')
            .replace(/换成/g, '替换为');
          
          // 处理 "XXX替换为YYY" 格式 -> "将XXX替换为YYY"
          // 匹配: (名词)(替换为)(名词)
          if (/^([\u4e00-\u9fa5\w]+)替换为([\u4e00-\u9fa5\w]+)/.test(cleanedContent)) {
            cleanedContent = cleanedContent.replace(/^([\u4e00-\u9fa5\w]+)替换为/, '将$1替换为');
          }
          
          // 确保以动词开头（如果不是以常见动词开头）
          if (!/^(将|把|替换|改|变|添加|删除|移除|修改|调整)/.test(cleanedContent)) {
            cleanedContent = '将' + cleanedContent;
          }
          
          const formatted = `[蒙版中的${colorName}区域]需要${cleanedContent}`;
          replacements.push({ color: colorName, original: trimmedContent, formatted });
          return formatted;
        } else {
          // 如果没有内容，仅标记区域
          const formatted = `[蒙版中的${colorName}区域]`;
          replacements.push({ color: colorName, original: '', formatted });
          return formatted;
        }
      });
    });
    
    // 确保多个区域指令之间有明确分隔
    // 方法：在每个格式化后的区域指令后添加分号和换行
    let finalProcessedPrompt = processedPrompt;
    const regionPattern = /$$蒙版中的[^$$区域]需要[^;$$]+/g;
    const regions = finalProcessedPrompt.match(regionPattern);
    
    if (regions && regions.length > 1) {
      // 如果有多个区域，用分号和换行分隔
      finalProcessedPrompt = regions.join(';\n');
    }
    
    processedPrompt = finalProcessedPrompt;
    
    // 记录替换日志
    if (replacements.length > 0) {
      replacements.forEach(({ color, original, formatted }) => {
        const log = `@${color} "${original}" → "${formatted}"`;
        replacementLog.push(log);
        console.log(`✓ ${log}`);
      });
    }
  }
  
  return {
    processedPrompt,
    replacementLog
  };
}

// 改进后的结构化提示词构建函数
function buildStructuredPrompt(options) {
  const { userPrompt, hasMask, maskElements, hasReference, referenceCount, resolution } = options;
  
  const sections = [];
  
  // 第1部分：任务定义
  sections.push('[TASK DEFINITION]');
  sections.push('Generate a high-quality image based on the input image and user requirements.');
  sections.push(`Output resolution: ${resolution}`);
  sections.push('');
  
  // 第2部分：输入图像说明
  sections.push('[INPUT IMAGES]');
  sections.push('- Image 1: Base image (main content)');
  if (hasReference) {
    for (let i = 0; i < referenceCount; i++) {
      sections.push(`- Image ${i + 2}: Reference image for style/content guidance`);
    }
  }
  sections.push('');
  
  // 第3部分：用户需求
  sections.push('[USER REQUIREMENTS]');
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
  sections.push('');
  
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
    };
    
    const colorGroups = new Set();
    maskElements.forEach(el => {
      const colorName = colorMap[el.color.toUpperCase()] || el.color;
      colorGroups.add(colorName);
    });
    
    const maskColors = Array.from(colorGroups).join(', ');
    
    sections.push('[MASK REGIONS - CRITICAL INSTRUCTIONS]');
    sections.push('⚠️ A binary mask is provided to precisely define the modification areas:');
    sections.push('- WHITE areas in the mask: These regions MUST be modified according to user requirements');
    sections.push('- BLACK areas in the mask: These regions MUST remain completely unchanged');
    sections.push(`- The mask contains ${maskElements.length} element(s) marked with ${maskColors} color(s) in the UI`);
    sections.push('');
    sections.push('🎯 Modification Strategy:');
    sections.push('1. Identify the white regions in the provided mask');
    sections.push('2. Apply modifications ONLY to these white mask areas');
    sections.push('3. Preserve all other areas exactly as they appear in Image 1');
    sections.push('4. Ensure seamless blending between modified and unchanged regions');
    sections.push('5. Maintain the overall composition and lighting consistency');
    
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
        sections.push('📝 Specific Region Instructions:')
        regionInstructions.forEach(instruction => {
          sections.push(instruction);
        });
      }
    }
    
    sections.push('');
  }
  
  // 第5部分：质量要求
  sections.push('[QUALITY REQUIREMENTS]');
  sections.push('- Maintain high image quality and sharpness');
  sections.push('- Ensure natural lighting and color consistency');
  sections.push('- Keep realistic textures and details');
  sections.push('- Preserve the original image composition where not modified');
  if (hasMask) {
    sections.push('- Create smooth transitions between masked and unmasked areas');
    sections.push('- Strictly follow the mask boundaries without bleeding effects');
  }
  sections.push('');
  
  // 第6部分：最终输出指导
  sections.push('[OUTPUT GUIDANCE]');
  sections.push('Generate a single, complete image that:');
  if (hasMask) {
    sections.push('1. Modifies ONLY the white mask areas according to user requirements');
    sections.push('2. Keeps all black mask areas exactly as in the original image');
    sections.push('3. Ensures seamless integration between modified and preserved regions');
  } else {
    sections.push('1. Transforms the entire image according to user requirements');
    sections.push('2. Maintains natural appearance and coherence');
  }
  sections.push(`3. Outputs at exactly ${resolution} resolution`);
  sections.push('4. Delivers professional, high-quality results');
  
  return sections.join('\n');
}

// 测试用例
const testCases = [
  {
    name: "基本测试",
    prompt: "@黄色 鸟换成猫头鹰  @青色 鸟换成海豚  @品红 换成宝石",
    maskElements: [
      { color: "#FFFF00", type: "rectangle" },
      { color: "#00FFFF", type: "rectangle" },
      { color: "#FF00FF", type: "rectangle" }
    ],
    resolution: "1938x3840"
  },
  {
    name: "复杂描述测试",
    prompt: "@红色 这个形象的鸟统一变成猫头鹰  @绿色 这一形象的鸟统一变成小鸡",
    maskElements: [
      { color: "#FF0000", type: "rectangle" },
      { color: "#00FF00", type: "rectangle" }
    ],
    resolution: "3840x2160"
  }
];

console.log("=== 改进后的提示词转换逻辑测试 ===\n");

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: ${testCase.name}`);
  console.log(`原始提示词: ${testCase.prompt}`);
  
  // 处理提示词
  const { processedPrompt, replacementLog } = processPrompt(testCase.prompt, testCase.maskElements);
  
  console.log(`处理后提示词: ${processedPrompt}`);
  console.log("替换日志:");
  replacementLog.forEach(log => console.log(`  ${log}`));
  
  // 构建结构化提示词
  const structuredPrompt = buildStructuredPrompt({
    userPrompt: processedPrompt,
    hasMask: !!testCase.maskElements && testCase.maskElements.length > 0,
    maskElements: testCase.maskElements || [],
    hasReference: false,
    referenceCount: 0,
    resolution: testCase.resolution
  });
  
  console.log("\n结构化提示词:");
  console.log("========================================");
  console.log(structuredPrompt);
  console.log("========================================\n");
});

console.log("测试完成！");