import 'dotenv/config';
import { generateImage } from "./index.js";
import fs from 'fs/promises';
import path from 'path';

const RESULTS_DIR = 'control_group/replicate/flux-1-dev/results';
const PROMPTS_FILE = 'example_inputs/prompts.txt';

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

async function processPrompts() {
  console.log("🎨 Starting Replicate Flux-Dev batch image generation from prompts.txt");
  
  try {
    // Read prompts file
    const promptsContent = await fs.readFile(PROMPTS_FILE, 'utf-8');
    const prompts = promptsContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    console.log(`📋 Found ${prompts.length} prompts to process`);
    
    // Ensure results directory exists
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    
    const results = [];
    const startTime = Date.now();
    
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      const promptNumber = i + 1;
      
      console.log(`\n🎯 Processing prompt ${promptNumber}/${prompts.length}`);
      console.log(`Prompt: "${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}"`);
      
      try {
        const generationStart = Date.now();
        
        // Generate image with Replicate Flux-Dev (optimized settings)
        const result = await generateImage(prompt, {
          guidance: 3.5,
          image_size: 1024,
          aspect_ratio: '1:1',
          num_inference_steps: 28,
          speed_mode: 'Blink of an eye 👁️',
          output_format: 'png',
          output_quality: 100,
          num_images: 1,
          seed: 42
        });
        
        const generationTime = (Date.now() - generationStart) / 1000;
        
        // Save image(s)
        const savedImages = [];
        if (result.images && result.images.length > 0) {
          for (let j = 0; j < result.images.length; j++) {
            const filename = `prompt_${promptNumber.toString().padStart(2, '0')}_image_${j + 1}.png`;
            const saveResult = await saveImageData(result.images[j], filename);
            savedImages.push({ filename, ...saveResult });
          }
        }
        
        const promptResult = {
          promptNumber,
          prompt: prompt,
          success: true,
          executionTime: result.model_execution_time || generationTime,
          wallClockTime: generationTime,
          imagesGenerated: result.images?.length || 0,
          savedImages,
          metadata: {
            model_name: result.model_name,
            pipeline_complete: result.pipeline_complete,
            model: result.metadata?.model,
            guidance: result.metadata?.guidance,
            image_size: result.metadata?.image_size,
            aspect_ratio: result.metadata?.aspect_ratio,
            num_inference_steps: result.metadata?.num_inference_steps,
            speed_mode: result.metadata?.speed_mode
          }
        };
        
        results.push(promptResult);
        
        console.log(`✅ Generated ${result.images?.length || 0} image(s) in ${generationTime.toFixed(2)}s`);
        console.log(`📁 Saved as: ${savedImages.map(img => img.filename).join(', ')}`);
        
        // Add small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing prompt ${promptNumber}: ${error.message}`);
        
        const generationStart = Date.now();
        results.push({
          promptNumber,
          prompt: prompt,
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
      model: "replicate-flux-1-dev",
      totalPrompts: prompts.length,
      successfulGenerations: successfulResults.length,
      failedGenerations: results.filter(r => !r.success).length,
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
    const reportText = `# Replicate Flux-Dev Batch Image Generation Report

Generated: ${summary.timestamp}
Model: ${summary.model}

## Summary
- Total prompts: ${summary.totalPrompts}
- Successful generations: ${summary.successfulGenerations}
- Failed generations: ${summary.failedGenerations}
- Total images generated: ${summary.totalImages}
- Total wall-clock time: ${summary.totalExecutionTime.toFixed(2)}s
- Total model execution time: ${summary.totalModelExecutionTime.toFixed(2)}s
- Average time per prompt: ${summary.averageTimePerPrompt.toFixed(2)}s
- Average time per image: ${summary.averageTimePerImage.toFixed(2)}s
- Success rate: ${((summary.successfulGenerations / summary.totalPrompts) * 100).toFixed(1)}%

## Performance Metrics
- Time per image: ${summary.averageTimePerImage.toFixed(2)}s
- Images per minute: ${summary.averageTimePerImage > 0 ? (60 / summary.averageTimePerImage).toFixed(1) : 'N/A'}
- Total time for ${summary.totalImages} images: ${summary.totalModelExecutionTime.toFixed(2)}s

## Model Configuration
- Model: prunaai/flux.1-dev:b0306d92aa025bb747dc74162f3c27d6ed83798e08e5f8977adf3d859d0536a3
- Guidance: 3.5
- Image size: 1024x1024
- Aspect ratio: 1:1
- Inference steps: 28
- Speed mode: Juiced 🔥 (default)

## Individual Results
${results.map(r => {
  if (r.success) {
    return `✅ Prompt ${r.promptNumber}: "${r.prompt.substring(0, 50)}..." - ${r.imagesGenerated} images (${r.executionTime.toFixed(2)}s)`;
  } else {
    return `❌ Prompt ${r.promptNumber}: "${r.prompt.substring(0, 50)}..." - Error: ${r.error}`;
  }
}).join('\n')}

## Files Generated
${successfulResults.filter(r => r.savedImages).flatMap(r => 
  r.savedImages.map(img => `- ${img.filename} (${img.size ? (img.size / 1024).toFixed(1) + 'KB' : 'unknown size'})`)
).join('\n')}
`;
    
    await fs.writeFile(path.join(RESULTS_DIR, 'summary_report.md'), reportText);
    
    console.log("\n🎉 Replicate Flux-Dev batch processing completed!");
    console.log(`📊 Results: ${summary.successfulGenerations}/${summary.totalPrompts} successful (${((summary.successfulGenerations / summary.totalPrompts) * 100).toFixed(1)}%)`);
    console.log(`⏱️ Total time: ${summary.totalExecutionTime.toFixed(2)}s`);
    console.log(`📈 Time per image: ${summary.averageTimePerImage.toFixed(2)}s`);
    console.log(`📁 Results saved in: ${RESULTS_DIR}/`);
    console.log(`📋 Detailed report: ${RESULTS_DIR}/batch_results.json`);
    console.log(`📄 Summary report: ${RESULTS_DIR}/summary_report.md`);
    
    return summary;
    
  } catch (error) {
    console.error("❌ Replicate Flux-Dev batch processing failed:", error.message);
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
  
  processPrompts().catch(error => {
    console.error("Failed:", error);
    process.exit(1);
  });
}

export { processPrompts };