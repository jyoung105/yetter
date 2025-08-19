import 'dotenv/config';

// Configure the WaveSpeed API with API key from environment
const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;

async function editImage(prompt, imageUrl = null, options = {}) {
  if (!WAVESPEED_API_KEY) {
    console.error("Your API_KEY is not set, you can check it in Access Keys");
    throw new Error("WAVESPEED_API_KEY not configured");
  }

  const url = "https://api.wavespeed.ai/api/v3/wavespeed-ai/flux-kontext-dev-ultra-fast";
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${WAVESPEED_API_KEY}`
  };

  // Default image if none provided (same as in original code)
  const defaultImage = "https://d3gnftk2yhz9lr.wavespeed.ai/media/images/1750940187685254815_W4yPaBQU.jpg";

  const defaultPayload = {
    image: imageUrl || defaultImage,
    num_inference_steps: 28,
    guidance_scale: 2.5,
    num_images: 1,
    seed: -1,
    output_format: "png",
    enable_base64_output: false,
    enable_safety_checker: false,
    enable_sync_mode: false
  };

  const payload = {
    prompt: prompt,
    ...defaultPayload,
    ...options
  };

  try {
    console.log(`\n🎨 Editing image with WaveSpeed Flux-Kontext: "${prompt}"`);
    console.log(`🖼️ Input image: ${payload.image}`);
    console.log("Configuration:", payload);
    console.log("\n--- Starting Image Editing ---");
    
    const startTime = Date.now();
    
    // Submit the editing request
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    const requestId = result.data.id;
    console.log(`Task submitted successfully. Request ID: ${requestId}`);
    
    // Poll for completion
    while (true) {
      const statusResponse = await fetch(
        `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`, 
        { 
          headers: {
            "Authorization": `Bearer ${WAVESPEED_API_KEY}`
          } 
        }
      );
      
      const statusResult = await statusResponse.json();
      
      if (statusResponse.ok) {
        const data = statusResult.data;
        const status = data.status;
        
        if (status === "completed") {
          const totalTime = (Date.now() - startTime) / 1000;
          const resultUrl = data.outputs[0];
          console.log("✅ Task completed. URL:", resultUrl);
          console.log(`⏱️ Total editing time: ${totalTime.toFixed(2)}s`);
          
          return {
            success: true,
            images: [resultUrl],
            prompt: prompt,
            originalImage: payload.image,
            requestId: requestId,
            model_execution_time: totalTime,
            model_name: "wavespeed-flux-kontext-dev-ultra-fast",
            pipeline_complete: true,
            metadata: {
              num_inference_steps: payload.num_inference_steps,
              guidance_scale: payload.guidance_scale,
              seed: payload.seed,
              output_format: payload.output_format,
              safety_checker: payload.enable_safety_checker
            }
          };
        } else if (status === "failed") {
          console.error("❌ Task failed:", data.error);
          throw new Error(`Image editing failed: ${data.error}`);
        } else {
          console.log(`🔄 Task still processing. Status: ${status}`);
        }
      } else {
        console.error("Error checking status:", statusResponse.status, JSON.stringify(statusResult));
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }
      
      // Wait before next poll (0.1 second as in original)
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error("\n❌ WaveSpeed Flux-Kontext Image Editing Failed");
    console.error("Error:", error.message || error);
    throw error;
  }
}

// Main execution function
async function main() {
  // Check for API key
  if (!WAVESPEED_API_KEY) {
    console.error("❌ Error: Please set WAVESPEED_API_KEY environment variable");
    process.exit(1);
  }

  const prompt = process.argv[2] || "Change the car color to red.";
  
  // Parse additional options from command line
  const options = {};
  let imageUrl = null;
  
  if (process.argv.includes("--image")) {
    const imageIndex = process.argv.indexOf("--image");
    if (process.argv[imageIndex + 1]) {
      imageUrl = process.argv[imageIndex + 1];
    }
  }
  
  if (process.argv.includes("--seed")) {
    const seedIndex = process.argv.indexOf("--seed");
    if (process.argv[seedIndex + 1]) {
      options.seed = parseInt(process.argv[seedIndex + 1]);
    }
  }
  
  if (process.argv.includes("--steps")) {
    const stepsIndex = process.argv.indexOf("--steps");
    if (process.argv[stepsIndex + 1]) {
      options.num_inference_steps = parseInt(process.argv[stepsIndex + 1]);
    }
  }
  
  if (process.argv.includes("--guidance")) {
    const guidanceIndex = process.argv.indexOf("--guidance");
    if (process.argv[guidanceIndex + 1]) {
      options.guidance_scale = parseFloat(process.argv[guidanceIndex + 1]);
    }
  }

  try {
    const result = await editImage(prompt, imageUrl, options);
    console.log("\n--- Editing Result ---");
    console.log("✅ Image edited successfully!");
    console.log("Original image:", result.originalImage);
    console.log("Edited image URL:", result.images[0]);
    console.log("Request ID:", result.requestId);
    console.log("Editing time:", result.model_execution_time, "seconds");
    console.log("Model:", result.model_name);
    console.log("Inference steps:", result.metadata.num_inference_steps);
    console.log("Guidance scale:", result.metadata.guidance_scale);
  } catch (error) {
    console.error("Editing failed:", error);
    process.exit(1);
  }
}

// Export function for use as a module
export { editImage };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}