#!/bin/bash
# Run Performance Analysis Script
# This script sets up the virtual environment and runs the performance analysis

echo "Setting up Python virtual environment..."

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    python3 -m venv venv
    source venv/bin/activate
    pip install pandas matplotlib seaborn numpy
else
    source venv/bin/activate
fi

echo "Running performance analysis..."
python visualize_performance.py

echo ""
echo "Analysis complete! Check the plots/ directory for generated visualizations:"
echo "- plots/time_per_image_boxplot.png"
echo "- plots/total_time_10_images.png" 
echo "- plots/first_image_waiting_time.png"