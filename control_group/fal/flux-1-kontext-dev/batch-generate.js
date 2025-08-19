import 'dotenv/config';
import { generateEditedImage, imageToDataURL } from "./index.js";
import fs from 'fs/promises';
import path from 'path';

const RESULTS_DIR = 'control_group/fal/flux-1-kontext-dev/results';
const EDIT_PROMPTS_FILE = 'example_inputs/edit-prompts.txt';
const EDIT_IMAGES_DIR = 'example_inputs/edit-images';

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

async function processEdits() {
  console.log("🎨 Starting Fal AI Flux-Kontext-Dev batch image editing");
  
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
      console.log(`Edit prompt: "${editPrompt.substring(0, 80)}${editPrompt.length > 80 ? '...' : ''}"`);
      
      try {
        const generationStart = Date.now();
        
        // Convert image to data URL
        const imagePath = path.join(EDIT_IMAGES_DIR, sourceImage);
        const imageUrl = await imageToDataURL(imagePath);
        
        // Generate edited image with Fal AI Flux-Kontext-Dev (optimized settings)
        const result = await generateEditedImage(imageUrl, editPrompt, {
          num_inference_steps: 28,
          guidance_scale: 2.5,
          sync_mode: false,
          num_images: 1,
          enable_safety_checker: false,
          seed: 42,
          output_format: "png",
          accelerator: "none",
          resolution_mode: "match_input"
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
            strength: result.metadata?.strength,
            image_size: result.metadata?.image_size,
            num_inference_steps: result.metadata?.num_inference_steps,
            guidance_scale: result.metadata?.guidance_scale,
            seed: result.metadata?.seed,
            has_nsfw_concepts: result.metadata?.has_nsfw_concepts
          }
        };
        
        results.push(editResult);
        
        console.log(`✅ Generated ${result.images?.length || 0} edited image(s) in ${generationTime.toFixed(2)}s`);
        console.log(`📁 Saved as: ${savedImages.map(img => img.filename).join(', ')}`);
        if (result.metadata?.has_nsfw_concepts) {
          console.log(`⚠️ NSFW content detected`);
        }
        
        // Add small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing edit ${editNumber}: ${error.message}`);
        
        const generationStart = Date.now();
        results.push({
          editNumber,
          sourceImage: sortedImages[i],
          editPrompt: editPrompt,
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
    const nsfwCount = successfulResults.filter(r => r.metadata?.has_nsfw_concepts).length;
    
    // Generate summary report
    const summary = {
      model: "fal-flux-kontext-dev",
      totalEdits: numToProcess,
      successfulEdits: successfulResults.length,
      failedEdits: results.filter(r => !r.success).length,
      totalImages: totalImages,
      totalExecutionTime: totalTime,
      totalModelExecutionTime: totalExecutionTime,
      averageTimePerEdit: averageTimePerEdit,
      nsfwDetections: nsfwCount,
      timestamp: new Date().toISOString(),
      results
    };
    
    // Save detailed results
    await fs.writeFile(
      path.join(RESULTS_DIR, 'batch_results.json'),
      JSON.stringify(summary, null, 2)
    );
    
    // Save summary report
    const reportText = `# Fal AI Flux-Kontext-Dev Batch Image Editing Report

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
- NSFW detections: ${summary.nsfwDetections}

## Performance Metrics
- Time per edit: ${summary.averageTimePerEdit.toFixed(2)}s
- Edits per minute: ${summary.averageTimePerEdit > 0 ? (60 / summary.averageTimePerEdit).toFixed(1) : 'N/A'}
- Total time for ${summary.totalImages} edits: ${summary.totalModelExecutionTime.toFixed(2)}s

## Model Configuration
- Model: fal-ai/flux/kontext-dev
- Image size: 1024
- Inference steps: 28
- Guidance scale: 2.5
- Number of images: 1
- Safety checker: disabled
- Seed: 42

## Individual Results
${results.map(r => {
  if (r.success) {
    const nsfwStr = r.metadata?.has_nsfw_concepts ? ' ⚠️ NSFW' : '';
    return `✅ Edit ${r.editNumber}: ${r.sourceImage} + "${r.editPrompt.substring(0, 40)}..." - ${r.imagesGenerated} images (${r.executionTime.toFixed(2)}s)${nsfwStr}`;
  } else {
    return `❌ Edit ${r.editNumber}: ${r.sourceImage} + "${r.editPrompt.substring(0, 40)}..." - Error: ${r.error}`;
  }
}).join('\n')}

## Files Generated
${successfulResults.filter(r => r.savedImages).flatMap(r => 
  r.savedImages.map(img => `- ${img.filename} (${img.size ? (img.size / 1024).toFixed(1) + 'KB' : 'unknown size'})`)
).join('\n')}
`;
    
    await fs.writeFile(path.join(RESULTS_DIR, 'summary_report.md'), reportText);
    
    console.log("\n🎉 Fal AI Flux-Kontext-Dev batch editing completed!");
    console.log(`📊 Results: ${summary.successfulEdits}/${summary.totalEdits} successful (${((summary.successfulEdits / summary.totalEdits) * 100).toFixed(1)}%)`);
    console.log(`⏱️ Total time: ${summary.totalExecutionTime.toFixed(2)}s`);
    console.log(`📈 Time per edit: ${summary.averageTimePerEdit.toFixed(2)}s`);
    if (summary.nsfwDetections > 0) {
      console.log(`⚠️ NSFW content detected in ${summary.nsfwDetections} edit(s)`);
    }
    console.log(`📁 Results saved in: ${RESULTS_DIR}/`);
    console.log(`📋 Detailed report: ${RESULTS_DIR}/batch_results.json`);
    console.log(`📄 Summary report: ${RESULTS_DIR}/summary_report.md`);
    
    return summary;
    
  } catch (error) {
    console.error("❌ Fal AI Flux-Kontext-Dev batch editing failed:", error.message);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check for API key
  if (!process.env.FAL_KEY) {
    console.error("❌ Error: Please set FAL_KEY environment variable");
    process.exit(1);
  }
  
  processEdits().catch(error => {
    console.error("Failed:", error);
    process.exit(1);
  });
}

export { processEdits };