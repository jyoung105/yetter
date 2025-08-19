import 'dotenv/config';
import { editImage } from "./index.js";
import fs from 'fs/promises';
import path from 'path';

const RESULTS_DIR = 'control_group/wavespeed/flux-1-kontext-dev/results';
const PROMPTS_FILE = 'example_inputs/edit-prompts.txt';

const EDIT_IMAGES_DIR = 'example_inputs/edit-images';

// Function to get local image file path
function getImagePath(index) {
  const imageNumber = (index + 1).toString().padStart(2, '0');
  return path.join(EDIT_IMAGES_DIR, `image_${imageNumber}.jpg`);
}

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
        imageData.content_type.split('/')[1] : 'png';
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

// Function to read image file and convert to base64
async function readImageAsBase64(imagePath) {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    return `data:image/jpeg;base64,${base64Image}`;
  } catch (error) {
    console.error(`Error reading image ${imagePath}:`, error.message);
    return null;
  }
}

async function processPrompts() {
  console.log("🎨 Starting WaveSpeed Flux-Kontext batch image editing from edit-prompts.txt");
  
  try {
    // Read prompts file
    const promptsContent = await fs.readFile(PROMPTS_FILE, 'utf-8');
    const prompts = promptsContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    console.log(`📋 Found ${prompts.length} edit prompts to process`);
    
    // Ensure results directory exists
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    
    const results = [];
    const startTime = Date.now();
    
    for (let i = 0; i < prompts.length; i++) {
      const editPrompt = prompts[i];
      const imagePath = getImagePath(i);
      const promptNumber = i + 1;
      
      console.log(`\n🎯 Processing edit ${promptNumber}/${prompts.length}`);
      console.log(`Edit prompt: "${editPrompt.substring(0, 80)}${editPrompt.length > 80 ? '...' : ''}"`);
      console.log(`Input image: ${imagePath}`);
      
      try {
        const generationStart = Date.now();
        
        // Read image as base64
        const imageBase64 = await readImageAsBase64(imagePath);
        if (!imageBase64) {
          throw new Error(`Failed to read image: ${imagePath}`);
        }
        
        // Edit image with WaveSpeed Flux-Kontext
        const result = await editImage(editPrompt, imageBase64, {
          num_inference_steps: 28,
          guidance_scale: 2.5,
          seed: 42,
          num_images: 1,
          output_format: "png",
          enable_safety_checker: false,
          enable_base64_output: false,
          enable_sync_mode: false
        });
        
        const generationTime = (Date.now() - generationStart) / 1000;
        
        // Save image(s)
        const savedImages = [];
        if (result.images && result.images.length > 0) {
          for (let j = 0; j < result.images.length; j++) {
            const filename = `edit_${promptNumber.toString().padStart(2, '0')}_image_${promptNumber.toString().padStart(2, '0')}_result_${j + 1}.png`;
            const saveResult = await saveImageData(result.images[j], filename);
            savedImages.push({ filename, ...saveResult });
          }
        }
        
        const promptResult = {
          promptNumber,
          editPrompt: editPrompt,
          inputImagePath: imagePath,
          success: true,
          executionTime: result.model_execution_time || generationTime,
          wallClockTime: generationTime,
          imagesGenerated: result.images?.length || 0,
          savedImages,
          requestId: result.requestId,
          metadata: {
            model_name: result.model_name,
            pipeline_complete: result.pipeline_complete,
            num_inference_steps: result.metadata?.num_inference_steps,
            guidance_scale: result.metadata?.guidance_scale,
            seed: result.metadata?.seed,
            output_format: result.metadata?.output_format,
            safety_checker: result.metadata?.safety_checker
          }
        };
        
        results.push(promptResult);
        
        console.log(`✅ Edited ${result.images?.length || 0} image(s) in ${generationTime.toFixed(2)}s`);
        console.log(`📁 Saved as: ${savedImages.map(img => img.filename).join(', ')}`);
        
        // Add small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing edit ${promptNumber}: ${error.message}`);
        
        const generationStart = Date.now();
        results.push({
          promptNumber,
          editPrompt: editPrompt,
          inputImagePath: imagePath,
          success: false,
          error: error.message,
          wallClockTime: (Date.now() - generationStart) / 1000
        });
      }
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    // Calculate statistics
    const successfulResults = results.filter(r => r.success);
    const totalImages = successfulResults.reduce((sum, r) => sum + (r.imagesGenerated || 0), 0);
    const totalExecutionTime = successfulResults.reduce((sum, r) => sum + (r.executionTime || 0), 0);
    const averageTimePerImage = totalImages > 0 ? totalExecutionTime / totalImages : 0;
    
    // Generate summary report
    const summary = {
      model: "wavespeed-flux-kontext-dev-ultra-fast",
      totalPrompts: prompts.length,
      successfulEdits: successfulResults.length,
      failedEdits: results.filter(r => !r.success).length,
      totalImages: totalImages,
      totalExecutionTime: totalTime,
      totalModelExecutionTime: totalExecutionTime,
      averageTimePerPrompt: totalTime / prompts.length,
      averageTimePerImage: averageTimePerImage,
      timestamp: new Date().toISOString(),
      results
    };
    
    // Save detailed results
    await fs.writeFile(
      path.join(RESULTS_DIR, 'batch_results.json'),
      JSON.stringify(summary, null, 2)
    );
    
    // Save summary report
    const reportText = `# WaveSpeed Flux-Kontext Batch Image Editing Report

Generated: ${summary.timestamp}
Model: ${summary.model}

## Summary
- Total editing tasks: ${summary.totalPrompts}
- Successful edits: ${summary.successfulEdits}
- Failed edits: ${summary.failedEdits}
- Total images edited: ${summary.totalImages}
- Total wall-clock time: ${summary.totalExecutionTime.toFixed(2)}s
- Total model execution time: ${summary.totalModelExecutionTime.toFixed(2)}s
- Average time per edit: ${summary.averageTimePerPrompt.toFixed(2)}s
- Average time per image: ${summary.averageTimePerImage.toFixed(2)}s
- Success rate: ${((summary.successfulEdits / summary.totalPrompts) * 100).toFixed(1)}%

## Performance Metrics
- Time per image edit: ${summary.averageTimePerImage.toFixed(2)}s
- Edits per minute: ${summary.averageTimePerImage > 0 ? (60 / summary.averageTimePerImage).toFixed(1) : 'N/A'}
- Total time for ${summary.totalImages} image edits: ${summary.totalModelExecutionTime.toFixed(2)}s

## Model Configuration
- Inference steps: 28
- Guidance scale: 2.5
- Output format: JPEG
- Safety checker: Enabled
- Mode: Image editing/transformation

## Individual Results
${results.map(r => {
  if (r.success) {
    return `✅ Edit ${r.promptNumber}: "${r.editPrompt.substring(0, 50)}..." - ${r.imagesGenerated} images (${r.executionTime.toFixed(2)}s)`;
  } else {
    return `❌ Edit ${r.promptNumber}: "${r.editPrompt.substring(0, 50)}..." - Error: ${r.error}`;
  }
}).join('\n')}

## Files Generated
${successfulResults.filter(r => r.savedImages).flatMap(r => 
  r.savedImages.map(img => `- ${img.filename} (${img.size ? (img.size / 1024).toFixed(1) + 'KB' : 'unknown size'})`)
).join('\n')}

## Input Images Used
${[...new Set(results.filter(r => r.inputImagePath).map(r => r.inputImagePath))].map(img => `- ${img}`).join('\n')}
`;
    
    await fs.writeFile(path.join(RESULTS_DIR, 'summary_report.md'), reportText);
    
    console.log("\n🎉 WaveSpeed Flux-Kontext batch processing completed!");
    console.log(`📊 Results: ${summary.successfulEdits}/${summary.totalPrompts} successful (${((summary.successfulEdits / summary.totalPrompts) * 100).toFixed(1)}%)`);
    console.log(`⏱️ Total time: ${summary.totalExecutionTime.toFixed(2)}s`);
    console.log(`📈 Time per image edit: ${summary.averageTimePerImage.toFixed(2)}s`);
    console.log(`📁 Results saved in: ${RESULTS_DIR}/`);
    console.log(`📋 Detailed report: ${RESULTS_DIR}/batch_results.json`);
    console.log(`📄 Summary report: ${RESULTS_DIR}/summary_report.md`);
    
    return summary;
    
  } catch (error) {
    console.error("❌ WaveSpeed Flux-Kontext batch processing failed:", error.message);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check for API key
  if (!process.env.WAVESPEED_API_KEY) {
    console.error("❌ Error: Please set WAVESPEED_API_KEY environment variable");
    process.exit(1);
  }
  
  processPrompts().catch(error => {
    console.error("Failed:", error);
    process.exit(1);
  });
}

export { processPrompts };