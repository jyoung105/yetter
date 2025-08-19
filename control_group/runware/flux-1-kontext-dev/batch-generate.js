import 'dotenv/config';
import { generateImage, fileToBase64 } from "./index.js";
import fs from 'fs/promises';
import path from 'path';

const RESULTS_DIR = 'control_group/runware/flux-1-kontext-dev/results';
const PROMPTS_FILE = 'example_inputs/prompts.txt';
const EDIT_PROMPTS_FILE = 'example_inputs/edit-prompts.txt';
const REFERENCE_IMAGES_DIR = 'example_inputs/edit-images';

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

async function loadReferenceImages() {
  try {
    const referenceImages = [];
    
    // Check if reference images directory exists
    try {
      await fs.access(REFERENCE_IMAGES_DIR);
    } catch {
      console.log(`📸 No reference images directory found at ${REFERENCE_IMAGES_DIR}`);
      return referenceImages;
    }
    
    const files = await fs.readdir(REFERENCE_IMAGES_DIR);
    const imageFiles = files.filter(file => 
      /\.(png|jpg|jpeg|webp)$/i.test(file)
    ).sort(); // Sort to ensure consistent ordering
    
    if (imageFiles.length === 0) {
      console.log(`📸 No reference images found in ${REFERENCE_IMAGES_DIR}`);
      return referenceImages;
    }
    
    console.log(`📸 Loading ${imageFiles.length} reference image(s) from ${REFERENCE_IMAGES_DIR}`);
    
    for (const filename of imageFiles) {
      try {
        const filePath = path.join(REFERENCE_IMAGES_DIR, filename);
        const base64Image = await fileToBase64(filePath);
        
        // Extract image number from filename (e.g., image_01.jpg -> 1)
        const imageNumber = filename.match(/\d+/)?.[0];
        
        referenceImages.push({
          filename,
          base64: base64Image,
          imageNumber: imageNumber ? parseInt(imageNumber) : null
        });
        console.log(`✅ Loaded: ${filename} (image ${imageNumber || 'unknown'})`);
      } catch (error) {
        console.error(`❌ Failed to load ${filename}: ${error.message}`);
      }
    }
    
    return referenceImages;
  } catch (error) {
    console.error(`❌ Error loading reference images: ${error.message}`);
    return [];
  }
}

async function processPrompts(mode = 'auto') {
  let promptsFile, promptsDescription;
  
  // Determine mode and files to use
  if (mode === 'auto') {
    // Auto-detect based on available files and images
    const hasReferenceImages = await fs.access(REFERENCE_IMAGES_DIR).then(() => true).catch(() => false);
    const hasEditPrompts = await fs.access(EDIT_PROMPTS_FILE).then(() => true).catch(() => false);
    
    if (hasReferenceImages && hasEditPrompts) {
      mode = 'edit';
      promptsFile = EDIT_PROMPTS_FILE;
      promptsDescription = 'edit-prompts.txt (image editing mode)';
    } else {
      mode = 'text';
      promptsFile = PROMPTS_FILE;
      promptsDescription = 'prompts.txt (text-to-image mode)';
    }
  } else if (mode === 'edit') {
    promptsFile = EDIT_PROMPTS_FILE;
    promptsDescription = 'edit-prompts.txt (image editing mode)';
  } else {
    promptsFile = PROMPTS_FILE;
    promptsDescription = 'prompts.txt (text-to-image mode)';
  }
  
  console.log(`🎨 Starting Runware Flux-Kontext-Dev batch generation - Mode: ${mode.toUpperCase()}`);
  console.log(`📋 Using: ${promptsDescription}`);
  
  try {
    // Load reference images if in edit mode
    let referenceImages = [];
    if (mode === 'edit') {
      referenceImages = await loadReferenceImages();
      if (referenceImages.length === 0) {
        console.log('⚠️ No reference images found for edit mode, switching to text-to-image mode');
        mode = 'text';
        promptsFile = PROMPTS_FILE;
        promptsDescription = 'prompts.txt (fallback to text-to-image mode)';
      }
    }
    
    // Read prompts file
    const promptsContent = await fs.readFile(promptsFile, 'utf-8');
    const prompts = promptsContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    console.log(`📋 Found ${prompts.length} prompts to process`);
    if (mode === 'edit' && referenceImages.length > 0) {
      console.log(`📸 Image editing mode: pairing prompts with reference images`);
    } else {
      console.log(`🎨 Text-to-image mode: no reference images`);
    }
    
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
        
        // Prepare reference images for this generation
        let currentReferenceImages = [];
        
        if (mode === 'edit' && referenceImages.length > 0) {
          // In edit mode, pair each prompt with its corresponding reference image
          const matchingImage = referenceImages.find(img => img.imageNumber === promptNumber);
          if (matchingImage) {
            currentReferenceImages = [matchingImage.base64];
            console.log(`📸 Using reference image: ${matchingImage.filename}`);
          } else {
            console.log(`⚠️ No matching reference image found for prompt ${promptNumber}, using first available`);
            currentReferenceImages = [referenceImages[0].base64];
          }
        }
        
        // Generate image with Runware Flux-Kontext-Dev (optimized settings)
        const result = await generateImage(prompt, {
          steps: 28,
          CFGScale: 2.5,
          numberResults: 1,
          outputFormat: "PNG",
          scheduler: "Default",
          advancedFeatures: {
            guidanceEndStepPercentage: 75
          },
          seed: 42
        }, currentReferenceImages);
        
        const generationTime = (Date.now() - generationStart) / 1000;
        
        // Save image(s)
        const savedImages = [];
        if (result.images && result.images.length > 0) {
          for (let j = 0; j < result.images.length; j++) {
            const prefix = mode === 'edit' ? 'edit' : 'prompt';
            const filename = `${prefix}_${promptNumber.toString().padStart(2, '0')}_image_${j + 1}.png`;
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
          referenceImagesUsed: referenceImages.map(img => img.filename),
          metadata: {
            model_name: result.model_name,
            pipeline_complete: result.pipeline_complete,
            model: result.metadata?.model,
            steps: result.metadata?.steps,
            CFGScale: result.metadata?.CFGScale,
            scheduler: result.metadata?.scheduler,
            outputFormat: result.metadata?.outputFormat,
            advancedFeatures: result.metadata?.advancedFeatures,
            cost: result.metadata?.cost,
            referenceImages: result.metadata?.referenceImages
          }
        };
        
        results.push(promptResult);
        
        console.log(`✅ Generated ${result.images?.length || 0} image(s) in ${generationTime.toFixed(2)}s`);
        console.log(`📁 Saved as: ${savedImages.map(img => img.filename).join(', ')}`);
        if (result.metadata?.referenceImages) {
          console.log(`📸 Used ${result.metadata.referenceImages.count} reference image(s)`);
        }
        if (result.metadata?.cost) {
          console.log(`💰 Cost: ${result.metadata.cost}`);
        }
        
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
    const totalCost = successfulResults.reduce((sum, r) => sum + (r.metadata?.cost || 0), 0);
    
    // Generate summary report
    const summary = {
      model: "runware-flux-1-kontext-dev",
      mode: mode,
      promptsFile: promptsFile,
      totalPrompts: prompts.length,
      successfulGenerations: successfulResults.length,
      failedGenerations: results.filter(r => !r.success).length,
      totalImages: totalImages,
      totalExecutionTime: totalTime,
      totalModelExecutionTime: totalExecutionTime,
      averageTimePerPrompt: totalTime / prompts.length,
      averageTimePerImage: averageTimePerImage,
      totalCost: totalCost,
      referenceImagesUsed: referenceImages.length > 0 ? referenceImages.map(img => img.filename) : null,
      timestamp: new Date().toISOString(),
      results
    };
    
    // Save detailed results
    await fs.writeFile(
      path.join(RESULTS_DIR, 'batch_results.json'),
      JSON.stringify(summary, null, 2)
    );
    
    // Save summary report
    const reportText = `# Runware Flux-Kontext-Dev Batch Image Generation Report

Generated: ${summary.timestamp}
Model: ${summary.model}
Mode: ${summary.mode.toUpperCase()}
Prompts File: ${summary.promptsFile}
Reference Images: ${summary.referenceImagesUsed ? summary.referenceImagesUsed.join(', ') : 'None'}

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
- Total cost: ${summary.totalCost.toFixed(4)}

## Performance Metrics
- Time per image: ${summary.averageTimePerImage.toFixed(2)}s
- Images per minute: ${summary.averageTimePerImage > 0 ? (60 / summary.averageTimePerImage).toFixed(1) : 'N/A'}
- Total time for ${summary.totalImages} images: ${summary.totalModelExecutionTime.toFixed(2)}s

## Model Configuration
- Model: runware:106@1
- Inference steps: 28
- CFG scale: 2.5
- Scheduler: Default
- Guidance End Step Percentage: 75
- Output format: PNG

## Individual Results
${results.map(r => {
  if (r.success) {
    const costStr = r.metadata?.cost ? ` (cost: ${r.metadata.cost})` : '';
    const refStr = r.referenceImagesUsed && r.referenceImagesUsed.length > 0 ? ` [ref: ${r.referenceImagesUsed.length}]` : '';
    return `✅ Prompt ${r.promptNumber}: "${r.prompt.substring(0, 50)}..." - ${r.imagesGenerated} images (${r.executionTime.toFixed(2)}s)${refStr}${costStr}`;
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
    
    console.log("\n🎉 Runware Flux-Kontext-Dev batch processing completed!");
    console.log(`📊 Results: ${summary.successfulGenerations}/${summary.totalPrompts} successful (${((summary.successfulGenerations / summary.totalPrompts) * 100).toFixed(1)}%)`);
    console.log(`⏱️ Total time: ${summary.totalExecutionTime.toFixed(2)}s`);
    console.log(`📈 Time per image: ${summary.averageTimePerImage.toFixed(2)}s`);
    console.log(`💰 Total cost: ${summary.totalCost.toFixed(4)}`);
    console.log(`📁 Results saved in: ${RESULTS_DIR}/`);
    console.log(`📋 Detailed report: ${RESULTS_DIR}/batch_results.json`);
    console.log(`📄 Summary report: ${RESULTS_DIR}/summary_report.md`);
    
    return summary;
    
  } catch (error) {
    console.error("❌ Runware Flux-Kontext-Dev batch processing failed:", error.message);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check for API key
  if (!process.env.RUNWARE_API_KEY) {
    console.error("❌ Error: Please set RUNWARE_API_KEY environment variable");
    process.exit(1);
  }
  
  // Parse command line arguments
  let mode = 'auto';
  if (process.argv.includes('--mode')) {
    const modeIndex = process.argv.indexOf('--mode');
    if (process.argv[modeIndex + 1]) {
      mode = process.argv[modeIndex + 1];
      if (!['auto', 'text', 'edit'].includes(mode)) {
        console.error("❌ Error: --mode must be 'auto', 'text', or 'edit'");
        process.exit(1);
      }
    }
  }
  
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🎨 Runware Flux-Kontext-Dev Batch Image Generation

Usage:
  node batch-generate.js [options]

Options:
  --mode <mode>    Generation mode (default: auto)
                   auto: Auto-detect based on available files
                   text: Text-to-image using prompts.txt
                   edit: Image editing using edit-prompts.txt + edit-images/

Modes:
  TEXT Mode: Uses example_inputs/prompts.txt for text-to-image generation
  EDIT Mode: Uses example_inputs/edit-prompts.txt + example_inputs/edit-images/
             Pairs each prompt with corresponding reference image (image_01.jpg → prompt 1)

Examples:
  node batch-generate.js                  # Auto-detect mode
  node batch-generate.js --mode text      # Force text-to-image mode
  node batch-generate.js --mode edit      # Force image editing mode
`);
    process.exit(0);
  }
  
  processPrompts(mode)
    .then(() => {
      console.log("✅ Flux-Kontext-Dev batch processing completed successfully");
      process.exit(0);
    })
    .catch(error => {
      console.error("Failed:", error);
      process.exit(1);
    });
}

export { processPrompts };