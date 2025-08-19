import 'dotenv/config';
import { Runware } from "@runware/sdk-js";
import fs from 'fs/promises';
import path from 'path';

const RUNWARE_API_KEY = process.env.RUNWARE_API_KEY;

function validateReferenceImages(referenceImages) {
  if (!Array.isArray(referenceImages)) {
    throw new Error("referenceImages must be an array");
  }
  
  if (referenceImages.length > 2) {
    throw new Error("FLUX Kontext [dev] supports maximum 2 reference images");
  }
  
  const validatedImages = [];
  for (let i = 0; i < referenceImages.length; i++) {
    const image = referenceImages[i];
    
    if (typeof image !== 'string') {
      throw new Error(`Reference image ${i + 1} must be a string`);
    }
    
    // Check if it's a data URI format
    const dataUriPattern = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/;
    const match = image.match(dataUriPattern);
    
    if (!match) {
      throw new Error(`Reference image ${i + 1} must be in format: data:<mediaType>;base64,<encodedData>`);
    }
    
    const [, mediaType, format, base64Data] = match;
    
    // Validate base64 data
    try {
      Buffer.from(base64Data, 'base64');
    } catch (error) {
      throw new Error(`Reference image ${i + 1} contains invalid base64 data`);
    }
    
    validatedImages.push({
      original: image,
      mediaType,
      format,
      size: Buffer.from(base64Data, 'base64').length
    });
  }
  
  return validatedImages;
}

async function fileToBase64(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().substring(1);
    
    let mediaType;
    switch (ext) {
      case 'png':
        mediaType = 'image/png';
        break;
      case 'jpg':
      case 'jpeg':
        mediaType = 'image/jpeg';
        break;
      case 'webp':
        mediaType = 'image/webp';
        break;
      default:
        throw new Error(`Unsupported image format: ${ext}. Supported formats: png, jpg, jpeg, webp`);
    }
    
    const base64Data = fileBuffer.toString('base64');
    return `data:${mediaType};base64,${base64Data}`;
  } catch (error) {
    throw new Error(`Failed to convert file to base64: ${error.message}`);
  }
}

async function generateImage(prompt, options = {}, referenceImages = []) {
  if (!RUNWARE_API_KEY) {
    console.error("Your API_KEY is not set, you can check it in Access Keys");
    throw new Error("RUNWARE_API_KEY not configured");
  }

  // Validate reference images if provided
  let validatedReferenceImages = [];
  if (referenceImages.length > 0) {
    validatedReferenceImages = validateReferenceImages(referenceImages);
  }

  const runware = new Runware({ apiKey: RUNWARE_API_KEY });

  const defaultPayload = {
    taskType: "imageInference",
    model: "runware:106@1",
    numberResults: 1,
    outputFormat: "PNG",
    steps: 28,
    CFGScale: 2.5,
    scheduler: "Default",
    includeCost: true,
    outputType: ["URL"],
    advancedFeatures: {
      guidanceEndStepPercentage: 75
    }
  };

  const payload = {
    positivePrompt: prompt,
    ...defaultPayload,
    ...options
  };

  // Add referenceImages to payload if provided, otherwise add required width/height
  if (referenceImages.length > 0) {
    payload.referenceImages = referenceImages;
  } else {
    // Kontext model requires width/height when no reference images are provided
    payload.width = payload.width || 1024;
    payload.height = payload.height || 1024;
  }

  try {
    console.log(`\n🎨 Generating image with Runware Flux-Kontext-Dev: "${prompt}"`);
    if (referenceImages.length > 0) {
      console.log(`📸 Using ${referenceImages.length} reference image(s)`);
      validatedReferenceImages.forEach((img, i) => {
        console.log(`   ${i + 1}. ${img.mediaType} (${(img.size / 1024).toFixed(1)}KB)`);
      });
    }
    console.log("Configuration:", payload);
    console.log("\n--- Starting Image Generation ---");
    
    const startTime = Date.now();
    
    const images = await runware.requestImages(payload);
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    if (images && images.length > 0) {
      const imageUrl = images[0].imageURL;
      console.log("✅ Task completed. URL:", imageUrl);
      console.log(`⏱️ Total generation time: ${totalTime.toFixed(2)}s`);
      
      return {
        success: true,
        images: [imageUrl],
        prompt: prompt,
        model_execution_time: totalTime,
        model_name: "runware-flux-1-kontext-dev",
        pipeline_complete: true,
        metadata: {
          model: payload.model,
          steps: payload.steps,
          CFGScale: payload.CFGScale,
          scheduler: payload.scheduler,
          outputFormat: payload.outputFormat,
          advancedFeatures: payload.advancedFeatures,
          cost: images[0].cost || null,
          referenceImages: validatedReferenceImages.length > 0 ? {
            count: validatedReferenceImages.length,
            formats: validatedReferenceImages.map(img => img.format),
            totalSize: validatedReferenceImages.reduce((sum, img) => sum + img.size, 0)
          } : null
        }
      };
    } else {
      throw new Error("No images generated");
    }
  } catch (error) {
    console.error("\n❌ Runware Flux-Kontext-Dev Image Generation Failed");
    console.error("Error:", error.message || error);
    throw error;
  }
}

// Main execution function
async function main() {
  // Check for API key
  if (!RUNWARE_API_KEY) {
    console.error("❌ Error: Please set RUNWARE_API_KEY environment variable");
    process.exit(1);
  }

  const prompt = process.argv[2] || "Change the car color to red.";
  
  // Parse additional options from command line
  const options = {};
  let referenceImages = [];
  
  if (process.argv.includes("--steps")) {
    const stepsIndex = process.argv.indexOf("--steps");
    if (process.argv[stepsIndex + 1]) {
      options.steps = parseInt(process.argv[stepsIndex + 1]);
    }
  }
  if (process.argv.includes("--cfg")) {
    const cfgIndex = process.argv.indexOf("--cfg");
    if (process.argv[cfgIndex + 1]) {
      options.CFGScale = parseFloat(process.argv[cfgIndex + 1]);
    }
  }
  if (process.argv.includes("--guidance-end")) {
    const guidanceIndex = process.argv.indexOf("--guidance-end");
    if (process.argv[guidanceIndex + 1]) {
      options.advancedFeatures = {
        ...options.advancedFeatures,
        guidanceEndStepPercentage: parseInt(process.argv[guidanceIndex + 1])
      };
    }
  }
  
  // Parse reference images from command line
  if (process.argv.includes("--reference-images")) {
    const refIndex = process.argv.indexOf("--reference-images");
    if (process.argv[refIndex + 1]) {
      const imagePaths = process.argv[refIndex + 1].split(',');
      console.log(`📸 Converting ${imagePaths.length} reference image(s) to base64...`);
      
      for (const imagePath of imagePaths) {
        try {
          const base64Image = await fileToBase64(imagePath.trim());
          referenceImages.push(base64Image);
          console.log(`✅ Converted: ${imagePath.trim()}`);
        } catch (error) {
          console.error(`❌ Failed to convert ${imagePath.trim()}: ${error.message}`);
          process.exit(1);
        }
      }
    }
  }
  
  if (process.argv.includes("--reference-base64")) {
    const refBase64Index = process.argv.indexOf("--reference-base64");
    if (process.argv[refBase64Index + 1]) {
      const base64Images = process.argv[refBase64Index + 1].split(',');
      referenceImages = [...referenceImages, ...base64Images.map(img => img.trim())];
      console.log(`📸 Using ${base64Images.length} base64 reference image(s)`);
    }
  }

  try {
    const result = await generateImage(prompt, options, referenceImages);
    console.log("\n--- Generation Result ---");
    console.log("✅ Image generated successfully!");
    console.log("Image URL:", result.images[0]);
    console.log("Generation time:", result.model_execution_time, "seconds");
    console.log("Model:", result.model_name);
    console.log("Steps:", result.metadata.steps);
    console.log("CFG Scale:", result.metadata.CFGScale);
    console.log("Scheduler:", result.metadata.scheduler);
    console.log("Guidance End Step %:", result.metadata.advancedFeatures?.guidanceEndStepPercentage);
    if (result.metadata.referenceImages) {
      console.log("Reference Images:", result.metadata.referenceImages.count, "images");
      console.log("Reference Formats:", result.metadata.referenceImages.formats.join(', '));
      console.log("Total Reference Size:", (result.metadata.referenceImages.totalSize / 1024).toFixed(1), "KB");
    }
    if (result.metadata.cost) {
      console.log("Cost:", result.metadata.cost);
    }
  } catch (error) {
    console.error("Generation failed:", error);
    process.exit(1);
  }
}

// Export functions for use as a module
export { generateImage, fileToBase64, validateReferenceImages };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}