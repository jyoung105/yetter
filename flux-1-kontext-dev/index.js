import 'dotenv/config';
import { yetter } from "@yetter/client";
import fs from 'fs/promises';
import path from 'path';

// Configure the Yetter client with API key
yetter.configure({
  credentials: process.env.YTR_API_KEY || process.env.REACT_APP_YTR_API_KEY
});

const MODEL = "ytr-ai/flux/v1.0-dev/i2i/kontext";

// Helper function to convert local image to base64 data URL
async function imageToDataURL(imagePath) {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`Error reading image file ${imagePath}:`, error.message);
    throw error;
  }
}

async function generateEditedImage(imageUrl, prompt, options = {}) {
  const defaultOptions = {
    image_url: imageUrl,
    prompt: prompt,
    num_inference_steps: 28,
    guidance_scale: 2.5,
    sync_mode: false,
    num_images: 1,
    enable_safety_checker: false,
    acceleration: "none",
    resolution_mode: "",
    streaming: false
  };

  const input = { ...defaultOptions, ...options };

  try {
    console.log(`\n🎨 Editing image with Flux Kontext model`);
    console.log(`Edit prompt: "${prompt}"`);
    console.log(`Image URL: ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`);
    console.log("Configuration:", { ...input, image_url: input.image_url.substring(0, 50) + '...' });
    console.log("\n--- Starting Image Editing ---");

    const result = await yetter.subscribe(MODEL, {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        console.log(`[Queue Update] Status: ${update.status}, Position: ${update.queue_position}`);
        
        if (update.status === "IN_PROGRESS" && update.logs) {
          console.log("Processing logs:");
          update.logs.forEach(log => console.log(`  - ${log.message}`));
        } else if (update.status === "COMPLETED") {
          console.log("✅ Processing completed!");
        } else if (update.status === "FAILED") {
          console.error("❌ Processing failed. Logs:", update.logs);
        }
      },
    });

    console.log("\n--- Edit Result ---");
    console.log("✅ Image edited successfully!");
    console.log("Number of images:", result.images?.length || 0);
    console.log("Execution time:", result.model_execution_time, "seconds");
    console.log("Edit prompt used:", result.prompt);
    
    return result;

  } catch (error) {
    console.error("\n❌ Image Editing Failed");
    console.error("Error:", error.message || error);
    throw error;
  }
}

async function generateEditedImageStream(imageUrl, prompt, options = {}) {
  const defaultOptions = {
    image_url: imageUrl,
    prompt: prompt,
    num_inference_steps: 28,
    guidance_scale: 2.5,
    sync_mode: false,
    num_images: 1,
    enable_safety_checker: false,
    acceleration: "",
    resolution_mode: "",
    streaming: true
  };

  const input = { ...defaultOptions, ...options };

  try {
    console.log(`\n🎨 Streaming image editing with Flux Kontext model`);
    console.log(`Edit prompt: "${prompt}"`);
    console.log(`Image URL: ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`);
    console.log("Configuration:", { ...input, image_url: input.image_url.substring(0, 50) + '...' });
    console.log("\n--- Starting Stream ---");

    const streamInstance = await yetter.stream(MODEL, { input });
    const requestId = streamInstance.getRequestId();
    console.log(`Stream initiated for Request ID: ${requestId}`);

    // Iterate over stream events
    for await (const event of streamInstance) {
      console.log(`[STREAM EVENT - ${requestId}] Status: ${event.status}, Queue Position: ${event.queue_position}`);
      
      if (event.logs && event.logs.length > 0) {
        console.log(`  Logs for ${requestId}:`);
        event.logs.forEach(log => console.log(`    - ${log.message}`));
      }
    }

    console.log(`Stream for ${requestId} finished.`);

    // Get final result
    const result = await streamInstance.done();
    console.log("\n--- Stream Final Result ---");
    console.log("✅ Image edited successfully!");
    console.log("Number of images:", result.images?.length || 0);
    console.log("Execution time:", result.model_execution_time, "seconds");
    
    return result;

  } catch (error) {
    console.error("\n❌ Stream Image Editing Failed");
    console.error("Error:", error.message || error);
    throw error;
  }
}

// Main execution
async function main() {
  // Check for API key
  if (!process.env.YTR_API_KEY && !process.env.REACT_APP_YTR_API_KEY) {
    console.error("❌ Error: Please set YTR_API_KEY or REACT_APP_YTR_API_KEY environment variable");
    process.exit(1);
  }

  const imagePath = process.argv[2];
  const prompt = process.argv[3] || "Make the image more colorful";
  const useStream = process.argv.includes("--stream");

  if (!imagePath) {
    console.error("❌ Error: Please provide an image path as the first argument");
    console.error("Usage: node index.js <image-path> <edit-prompt> [--stream]");
    process.exit(1);
  }

  try {
    // Check if it's a URL or local file
    let imageUrl = imagePath;
    if (!imagePath.startsWith('http')) {
      // Convert local image to data URL
      console.log(`📁 Loading local image: ${imagePath}`);
      imageUrl = await imageToDataURL(imagePath);
    }

    if (useStream) {
      await generateEditedImageStream(imageUrl, prompt);
    } else {
      await generateEditedImage(imageUrl, prompt);
    }
  } catch (error) {
    console.error("Edit failed:", error);
    process.exit(1);
  }
}

// Export functions for use as a module
export { generateEditedImage, generateEditedImageStream, imageToDataURL };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}