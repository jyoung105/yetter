import 'dotenv/config';
import { generateEditedImage, imageToDataURL } from "./index.js";
import fs from 'fs/promises';
import path from 'path';

const RESULTS_DIR = 'control_group/replicate/flux-1-kontext-dev/results';
const EDIT_PROMPTS_FILE = 'example_inputs/edit-prompts.txt';
const EDIT_IMAGES_DIR = 'example_inputs/edit-images';

async function saveImageData(imageData, filename) {
  try {
    // Handle Replicate file objects with the new API
    if (imageData && typeof imageData.url === 'function') {
      // To access the file URL:
      const fileUrl = imageData.url();
      console.log(`File URL: ${fileUrl}`);
      
      // To write the file to disk:
      const filePath = path.join(RESULTS_DIR, filename);
      await fs.writeFile(filePath, imageData);
      
      // Get file stats for size
      const stats = await fs.stat(filePath);
      return { 
        success: true, 
        type: 'replicate_file', 
        size: stats.size,
        filename: filename,
        url: fileUrl
      };
    }
    // Fallback: If imageData is a URL string (older API)
    else if (typeof imageData === 'string' && (imageData.startsWith('http://') || imageData.startsWith('https://'))) {
      const response = await fetch(imageData);
      const buffer = await response.arrayBuffer();
      await fs.writeFile(path.join(RESULTS_DIR, filename), Buffer.from(buffer));
      return { success: true, type: 'url', size: buffer.byteLength };
    }
    // Fallback: If imageData is base64
    else if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.writeFile(path.join(RESULTS_DIR, filename), buffer);
      return { success: true, type: 'base64', size: buffer.length };
    }
    else {
      return { success: false, error: 'Unknown image data format' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function processEdits() {
  console.log("🎨 Starting Replicate Flux-Kontext-Dev batch image editing");
  
  try {
    // Read edit prompts file
    const promptsContent = await fs.readFile(EDIT_PROMPTS_FILE, 'utf-8');
    const editPrompts = promptsContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // Get list of source images
    const imageFiles = await fs.readdir(EDIT_IMAGES_DIR);
    const sortedImages = imageFiles
      .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
      .sort();
    
    console.log(`📋 Found ${editPrompts.length} edit prompts`);
    console.log(`🖼️ Found ${sortedImages.length} source images`);
    
    const numToProcess = Math.min(editPrompts.length, sortedImages.length);
    console.log(`🔄 Will process ${numToProcess} image edits`);
    
    // Ensure results directory exists
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    
    const results = [];
    const startTime = Date.now();
    
    for (let i = 0; i < numToProcess; i++) {
      const editPrompt = editPrompts[i];
      const sourceImage = sortedImages[i];
      const editNumber = i + 1;
      
      console.log(`\n🎯 Processing edit ${editNumber}/${numToProcess}`);
      console.log(`Source image: ${sourceImage}`);
      console.log(`Edit prompt: "${editPrompt ? editPrompt.substring(0, 80) : '[EMPTY]'}${editPrompt && editPrompt.length > 80 ? '...' : ''}"`);
      
      try {
        // Skip if no prompt available
        if (!editPrompt || editPrompt.trim().length === 0) {
          throw new Error('No edit prompt available for this image');
        }
        
        const generationStart = Date.now();
        
        // Convert image to data URL
        const imagePath = path.join(EDIT_IMAGES_DIR, sourceImage);
        const imageUrl = await imageToDataURL(imagePath);
        
        // Generate edited image with Replicate Flux-Kontext-Dev (optimized settings)
        const result = await generateEditedImage(imageUrl, editPrompt, {
          num_inference_steps: 28,
          guidance: 2.5,
          image_size: 1024,
          aspect_ratio: 'match_input_image',
          speed_mode: 'Real Time',
          output_format: 'png',
          output_quality: 100,
          seed: 42
        });
        
        const generationTime = (Date.now() - generationStart) / 1000;
        
        // Save edited image(s)
        const savedImages = [];
        if (result.images && result.images.length > 0) {
          for (let j = 0; j < result.images.length; j++) {
            const filename = `edit_${editNumber.toString().padStart(2, '0')}_${sourceImage.replace(/\.[^.]+$/, '')}_result_${j + 1}.png`;
            const saveResult = await saveImageData(result.images[j], filename);
            savedImages.push({ filename, ...saveResult });
          }
        }
        
        const editResult = {
          editNumber,
          sourceImage,
          editPrompt: editPrompt,
          success: true,
          executionTime: result.model_execution_time || generationTime,
          wallClockTime: generationTime,
          imagesGenerated: result.images?.length || 0,
          savedImages,
          metadata: {
            model_name: result.model_name,
            pipeline_complete: result.pipeline_complete,
            model: result.metadata?.model,
            guidance_scale: result.metadata?.guidance_scale,
            steps: result.metadata?.steps,
            strength: result.metadata?.strength,
            seed: result.metadata?.seed
          }
        };
        
        results.push(editResult);
        
        console.log(`✅ Generated ${result.images?.length || 0} edited image(s) in ${generationTime.toFixed(2)}s`);
        console.log(`📁 Saved as: ${savedImages.map(img => img.filename).join(', ')}`);
        
        // Add small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing edit ${editNumber}: ${error.message}`);
        
        const generationStart = Date.now();
        results.push({
          editNumber,
          sourceImage: sortedImages[i],
          editPrompt: editPrompt || '[EMPTY]',
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
    const averageTimePerEdit = numToProcess > 0 ? totalTime / numToProcess : 0;
    
    // Generate summary report
    const summary = {
      model: "replicate-flux-kontext-dev",
      totalEdits: numToProcess,
      successfulEdits: successfulResults.length,
      failedEdits: results.filter(r => !r.success).length,
      totalImages: totalImages,
      totalExecutionTime: totalTime,
      totalModelExecutionTime: totalExecutionTime,
      averageTimePerEdit: averageTimePerEdit,
      timestamp: new Date().toISOString(),
      results
    };
    
    // Save detailed results
    await fs.writeFile(
      path.join(RESULTS_DIR, 'batch_results.json'),
      JSON.stringify(summary, null, 2)
    );
    
    // Save summary report
    const reportText = `# Replicate Flux-Kontext-Dev Batch Image Editing Report

Generated: ${summary.timestamp}
Model: ${summary.model}

## Summary
- Total edits: ${summary.totalEdits}
- Successful edits: ${summary.successfulEdits}
- Failed edits: ${summary.failedEdits}
- Total images generated: ${summary.totalImages}
- Total wall-clock time: ${summary.totalExecutionTime.toFixed(2)}s
- Total model execution time: ${summary.totalModelExecutionTime.toFixed(2)}s
- Average time per edit: ${summary.averageTimePerEdit.toFixed(2)}s
- Success rate: ${((summary.successfulEdits / summary.totalEdits) * 100).toFixed(1)}%

## Performance Metrics
- Time per edit: ${summary.averageTimePerEdit.toFixed(2)}s
- Edits per minute: ${summary.averageTimePerEdit > 0 ? (60 / summary.averageTimePerEdit).toFixed(1) : 'N/A'}
- Total time for ${summary.totalImages} edits: ${summary.totalModelExecutionTime.toFixed(2)}s

## Model Configuration
- Model: prunaai/flux-kontext-dev
- Guidance scale: 2.5
- Inference steps: 28
- Strength: 0.8
- Seed: 42

## Individual Results
${results.map(r => {
  const promptPreview = r.editPrompt ? r.editPrompt.substring(0, 40) : '[EMPTY]';
  if (r.success) {
    return `✅ Edit ${r.editNumber}: ${r.sourceImage} + "${promptPreview}..." - ${r.imagesGenerated} images (${r.executionTime.toFixed(2)}s)`;
  } else {
    return `❌ Edit ${r.editNumber}: ${r.sourceImage} + "${promptPreview}..." - Error: ${r.error}`;
  }
}).join('\n')}

## Files Generated
${successfulResults.filter(r => r.savedImages).flatMap(r => 
  r.savedImages.map(img => `- ${img.filename} (${img.size ? (img.size / 1024).toFixed(1) + 'KB' : 'unknown size'})`)
).join('\n')}
`;
    
    await fs.writeFile(path.join(RESULTS_DIR, 'summary_report.md'), reportText);
    
    console.log("\n🎉 Replicate Flux-Kontext-Dev batch editing completed!");
    console.log(`📊 Results: ${summary.successfulEdits}/${summary.totalEdits} successful (${((summary.successfulEdits / summary.totalEdits) * 100).toFixed(1)}%)`);
    console.log(`⏱️ Total time: ${summary.totalExecutionTime.toFixed(2)}s`);
    console.log(`📈 Time per edit: ${summary.averageTimePerEdit.toFixed(2)}s`);
    console.log(`📁 Results saved in: ${RESULTS_DIR}/`);
    console.log(`📋 Detailed report: ${RESULTS_DIR}/batch_results.json`);
    console.log(`📄 Summary report: ${RESULTS_DIR}/summary_report.md`);
    
    return summary;
    
  } catch (error) {
    console.error("❌ Replicate Flux-Kontext-Dev batch editing failed:", error.message);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check for API key
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error("❌ Error: Please set REPLICATE_API_TOKEN environment variable");
    process.exit(1);
  }
  
  processEdits().catch(error => {
    console.error("Failed:", error);
    process.exit(1);
  });
}

export { processEdits };