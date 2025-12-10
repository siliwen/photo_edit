import Jimp from 'jimp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Banned colors (Mask colors)
// Excluding White (#FFFFFF) as it is common in natural images
const BANNED_COLORS = [
  { name: 'Red', hex: 0xFF0000FF },
  { name: 'Green', hex: 0x00FF00FF },
  { name: 'Blue', hex: 0x0000FFFF },
  { name: 'Yellow', hex: 0xFFFF00FF },
  { name: 'Cyan', hex: 0x00FFFFFF },
  { name: 'Magenta', hex: 0xFF00FFFF }
];

async function checkImage(imagePath) {
  console.log(`Checking image: ${imagePath}`);
  
  try {
    const image = await Jimp.read(imagePath);
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    let residueCount = 0;
    const residueDetails = {};

    image.scan(0, 0, width, height, (x, y, idx) => {
      const red = image.bitmap.data[idx + 0];
      const green = image.bitmap.data[idx + 1];
      const blue = image.bitmap.data[idx + 2];
      const alpha = image.bitmap.data[idx + 3];

      const hex = (red << 24 | green << 16 | blue << 8 | alpha) >>> 0;
      
      for (const color of BANNED_COLORS) {
        if (hex === color.hex) {
          residueCount++;
          residueDetails[color.name] = (residueDetails[color.name] || 0) + 1;
        }
      }
    });

    if (residueCount > 0) {
      console.error(`❌ Mask residue detected!`);
      console.error(`Total pixels with mask colors: ${residueCount}`);
      console.table(residueDetails);
      process.exit(1);
    } else {
      console.log(`✅ No mask residue detected.`);
    }

  } catch (error) {
    console.error(`Error reading image: ${error.message}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node check_mask_residue.js <image_path>');
  process.exit(0);
}

checkImage(args[0]);
