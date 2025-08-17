import { generateEditedImage } from "./index.js";
import fs from 'fs/promises';
import path from 'path';

const RESULTS_DIR = 'flux-1-kontext-dev/results';
const PROMPTS_FILE = 'edit-prompts.txt';
const IMAGES_DIR = 'edit-images';

async function saveImageData(imageData, filename) {
  try {
    // If imageData is a URL, fetch the image
    if (typeof imageData === 'string' && imageData.startsWith('http')) {
      const response = await fetch(imageData);
      const buffer = await response.arrayBuffer();
      await fs.writeFile(path.join(RESULTS_DIR, filename), Buffer.from(buffer));
      return { success: true, type: 'url', size: buffer.byteLength };
    }
    // If imageData is base64, decode and save
    else if (typeof imageData === 'string') {
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.writeFile(path.join(RESULTS_DIR, filename), buffer);
      return { success: true, type: 'base64', size: buffer.length };
    }
    // If imageData is an object with url property
    else if (imageData && imageData.url) {
      const response = await fetch(imageData.url);
      const buffer = await response.arrayBuffer();
      const ext = imageData.content_type ? 
        imageData.content_type.split('/')[1] : 'webp';
      const finalFilename = filename.replace(/\.[^.]+$/, `.${ext}`);
      await fs.writeFile(path.join(RESULTS_DIR, finalFilename), Buffer.from(buffer));
      return { 
        success: true, 
        type: 'object_url', 
        size: buffer.byteLength,
        filename: finalFilename,
        dimensions: `${imageData.width}x${imageData.height}`,
        content_type: imageData.content_type
      };
    }
    else {
      return { success: false, error: 'Unknown image data format' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function processEditPrompts() {
  console.log("🎨 Starting batch image editing with Flux Kontext model");
  console.log("📂 Reading edit prompts from edit-prompts.txt");
  console.log("🌐 Using GitHub URLs for images");
  
  try {
    // Read prompts file
    const promptsContent = await fs.readFile(PROMPTS_FILE, 'utf-8');
    const prompts = promptsContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    console.log(`📋 Found ${prompts.length} edit prompts`);
    
    // Get list of images from local directory (for reference)
    const imageFiles = await fs.readdir(IMAGES_DIR);
    const images = imageFiles
      .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
      .sort(); // Sort to ensure consistent pairing
    
    console.log(`🖼️ Found ${images.length} image references`);
    
    // Ensure we have matching counts
    const processCount = Math.min(prompts.length, images.length);
    if (prompts.length !== images.length) {
      console.warn(`⚠️ Warning: ${prompts.length} prompts but ${images.length} images. Processing ${processCount} pairs.`);
    }
    
    // Ensure results directory exists
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    
    const results = [];
    const startTime = Date.now();
    
    for (let i = 0; i < processCount; i++) {
      const prompt = prompts[i];
      const imageName = images[i];
      const editNumber = i + 1;
      
      console.log(`\n🎯 Processing edit ${editNumber}/${processCount}`);
      console.log(`Image: ${imageName}`);
      console.log(`Edit prompt: "${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}"`);
      
      try {
        const generationStart = Date.now();
        
        // Use GitHub URL for the image
        const githubImageUrl = `https://raw.githubusercontent.com/jyoung105/yetter/refs/heads/main/edit-images/${imageName}`;
        console.log(`🌐 Using GitHub URL: ${githubImageUrl}`);
        
        // Edit image with Flux Kontext settings
        const result = await generateEditedImage(githubImageUrl, prompt, {
          num_inference_steps: 28,
          seed: 42,
          guidance_scale: 2.5,
          num_images: 1,
          enable_safety_checker: false,
          sync_mode: false,
          acceleration: "none",
          resolution_mode: "match_input",
          streaming: false
        });
        
        const generationTime = (Date.now() - generationStart) / 1000;
        
        // Save edited image(s)
        const savedImages = [];
        if (result.images && result.images.length > 0) {
          for (let j = 0; j < result.images.length; j++) {
            const filename = `edit_${editNumber.toString().padStart(2, '0')}_${path.basename(imageName, path.extname(imageName))}_result_${j + 1}.webp`;
            const saveResult = await saveImageData(result.images[j], filename);
            savedImages.push({ filename, ...saveResult });
          }
        }
        
        const editResult = {
          editNumber,
          originalImage: imageName,
          prompt: prompt,
          success: true,
          executionTime: result.model_execution_time || generationTime,
          wallClockTime: generationTime,
          imagesGenerated: result.images?.length || 0,
          savedImages,
          metadata: {
            model_name: result.model_name,
            pipeline_complete: result.pipeline_complete
          }
        };
        
        results.push(editResult);
        
        console.log(`✅ Generated ${result.images?.length || 0} edited image(s) in ${generationTime.toFixed(2)}s`);
        
        // Add small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing edit ${editNumber}: ${error.message}`);
        
        results.push({
          editNumber,
          originalImage: imageName,
          prompt: prompt,
          success: false,
          error: error.message,
          wallClockTime: (Date.now() - generationStart) / 1000
        });
      }
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    // Generate summary report
    const summary = {
      model: "Flux Kontext v1.0-dev",
      totalEdits: processCount,
      successfulEdits: results.filter(r => r.success).length,
      failedEdits: results.filter(r => !r.success).length,
      totalImages: results.reduce((sum, r) => sum + (r.imagesGenerated || 0), 0),
      totalExecutionTime: totalTime,
      averageTimePerEdit: totalTime / processCount,
      timestamp: new Date().toISOString(),
      results
    };
    
    // Save detailed results
    await fs.writeFile(
      path.join(RESULTS_DIR, 'batch_results.json'),
      JSON.stringify(summary, null, 2)
    );
    
    // Save summary report
    const reportText = `# Flux Kontext Batch Image Editing Report

Generated: ${summary.timestamp}
Model: ${summary.model}

## Summary
- Total edits: ${summary.totalEdits}
- Successful edits: ${summary.successfulEdits}
- Failed edits: ${summary.failedEdits}
- Total images generated: ${summary.totalImages}
- Total time: ${summary.totalExecutionTime.toFixed(2)}s
- Average time per edit: ${summary.averageTimePerEdit.toFixed(2)}s
- Success rate: ${((summary.successfulEdits / summary.totalEdits) * 100).toFixed(1)}%

## Individual Results
${results.map(r => {
  if (r.success) {
    return `✅ Edit ${r.editNumber} (${r.originalImage}): "${r.prompt.substring(0, 50)}..." - ${r.imagesGenerated} images (${r.executionTime.toFixed(2)}s)`;
  } else {
    return `❌ Edit ${r.editNumber} (${r.originalImage}): "${r.prompt.substring(0, 50)}..." - Error: ${r.error}`;
  }
}).join('\n')}

## Files Generated
${results.filter(r => r.success && r.savedImages).flatMap(r => 
  r.savedImages.map(img => `- ${img.filename} (${img.size ? (img.size / 1024).toFixed(1) + 'KB' : 'unknown size'})`)
).join('\n')}
`;
    
    await fs.writeFile(path.join(RESULTS_DIR, 'summary_report.md'), reportText);
    
    console.log("\n🎉 Batch editing completed!");
    console.log(`📊 Results: ${summary.successfulEdits}/${summary.totalEdits} successful (${((summary.successfulEdits / summary.totalEdits) * 100).toFixed(1)}%)`);
    console.log(`⏱️ Total time: ${summary.totalExecutionTime.toFixed(2)}s`);
    console.log(`📁 Results saved in: ${RESULTS_DIR}/`);
    console.log(`📋 Detailed report: ${RESULTS_DIR}/batch_results.json`);
    console.log(`📄 Summary report: ${RESULTS_DIR}/summary_report.md`);
    
    return summary;
    
  } catch (error) {
    console.error("❌ Batch processing failed:", error.message);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check for API key
  if (!process.env.YTR_API_KEY && !process.env.REACT_APP_YTR_API_KEY) {
    console.error("❌ Error: Please set YTR_API_KEY or REACT_APP_YTR_API_KEY environment variable");
    process.exit(1);
  }
  
  processEditPrompts().catch(error => {
    console.error("Failed:", error);
    process.exit(1);
  });
}

export { processEditPrompts };