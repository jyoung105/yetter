import 'dotenv/config';
import { generateImage } from "./index.js";
import fs from 'fs/promises';
import path from 'path';

const RESULTS_DIR = 'control_group/replicate/qwen-image/results';
const PROMPTS_FILE = 'example_inputs/prompts.txt';

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

async function processPrompts() {
  console.log("🎨 Starting Replicate Qwen-Image batch image generation from prompts.txt");
  
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
        
        // Generate image with Replicate Qwen-Image (optimized settings)
        const result = await generateImage(prompt, {
          negative_prompt: '',
          enhance_prompt: false,
          image_size: 'optimize_for_quality',
          aspect_ratio: '1:1',
          output_format: 'png',
          output_quality: 100,
          go_fast: true,
          num_inference_steps: 50,
          guidance: 4,
          num_outputs: 1,
          disable_safety_checker: true,
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
            output_format: result.metadata?.output_format,
            aspect_ratio: result.metadata?.aspect_ratio,
            output_quality: result.metadata?.output_quality,
            num_outputs: result.metadata?.num_outputs
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
      model: "replicate-qwen-image",
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
    const reportText = `# Replicate Qwen-Image Batch Image Generation Report

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
- Model: Qwen-Image
- Output format: png
- Aspect ratio: 1:1
- Output quality: 100
- Number of outputs: 1

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
    
    console.log("\n🎉 Replicate Qwen-Image batch processing completed!");
    console.log(`📊 Results: ${summary.successfulGenerations}/${summary.totalPrompts} successful (${((summary.successfulGenerations / summary.totalPrompts) * 100).toFixed(1)}%)`);
    console.log(`⏱️ Total time: ${summary.totalExecutionTime.toFixed(2)}s`);
    console.log(`📈 Time per image: ${summary.averageTimePerImage.toFixed(2)}s`);
    console.log(`📁 Results saved in: ${RESULTS_DIR}/`);
    console.log(`📋 Detailed report: ${RESULTS_DIR}/batch_results.json`);
    console.log(`📄 Summary report: ${RESULTS_DIR}/summary_report.md`);
    
    return summary;
    
  } catch (error) {
    console.error("❌ Replicate Qwen-Image batch processing failed:", error.message);
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