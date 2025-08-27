# ===================================================================
# MODULAR MAIN - 2D ANIMATION PIPELINE
# ===================================================================
"""
Modular main entry point for the 2D Animation Pipeline.

This is a clean, organized version of the animation generation system
that imports functionality from separate modules for better maintainability.

Usage:
    python main_modular.py

The pipeline will:
1. Setup environment and configuration
2. Get topic input from user
3. Generate scene descriptions
4. Create Manim code for each scene
5. Save generated files
"""

import asyncio
from config import setup_environment, setup_directories
from pipeline import run_animation_pipeline, get_pipeline_summary

# ===================================================================
# MAIN EXECUTION
# ===================================================================

async def main():
    """
    Main entry point for the modular animation pipeline.
    
    Handles the complete workflow from initialization to
    final code generation and file output.
    """
    try:
        # ===== INITIALIZATION =====
        print("🚀 Initializing 2D Animation Pipeline...")
        
        # Setup environment and directories
        setup_environment()
        setup_directories()
        
        print("✅ Environment setup complete")
        
        # ===== USER INPUT =====
        topic = get_user_topic()
        
        # ===== PIPELINE EXECUTION =====
        print(f"\n🎬 Processing topic: '{topic}'")
        print("=" * 60)
        
        result = await run_animation_pipeline(topic)
        
        # ===== RESULTS SUMMARY =====
        display_results_summary(result)
        
    except KeyboardInterrupt:
        print("\n❌ Pipeline interrupted by user")
    except Exception as e:
        print(f"\n❌ Pipeline failed with error: {str(e)}")
        raise

def get_user_topic():
    """
    Get animation topic from user input.
    
    Returns:
        str: The educational topic to create animations for
    """
    print("\n📚 Topic Selection")
    print("-" * 20)
    topic = input("Enter a topic for animation (e.g., 'Pythagorean theorem'): ").strip()
    
    if not topic:
        print("❌ Topic cannot be empty. Using default: 'Mathematics Basics'")
        topic = "Mathematics Basics"
    
    return topic

def display_results_summary(result):
    """
    Display a summary of the pipeline execution results.
    
    Args:
        result: Complete pipeline execution result
    """
    summary = get_pipeline_summary(result)
    
    print("\n" + "=" * 60)
    print("📊 PIPELINE EXECUTION SUMMARY")
    print("=" * 60)
    print(f"Topic: {summary['topic']}")
    print(f"Total Scenes Generated: {summary['total_scenes']}")
    print(f"Manim Code Files Created: {summary['generated_codes']}")
    print(f"Pipeline Status: {'✅ SUCCESS' if summary['success'] else '❌ FAILED'}")
    
    if summary['success']:
        print(f"\n🎉 All files have been saved to the 'generated_scenes' directory!")
        print("💡 You can now run these Manim scripts to create your animations.")
    
    print("=" * 60)

# ===================================================================
# DEVELOPMENT AND DEBUGGING UTILITIES
# ===================================================================

def run_pipeline_with_debug(topic):
    """
    Run the pipeline with additional debugging information.
    
    Args:
        topic: The educational topic to process
    """
    import time
    
    start_time = time.time()
    result = asyncio.run(run_animation_pipeline(topic))
    end_time = time.time()
    
    print(f"\n⏱️  Total execution time: {end_time - start_time:.2f} seconds")
    return result

def test_pipeline():
    """
    Test the pipeline with a predefined topic for development.
    """
    test_topic = "Linear Equations"
    print(f"🧪 Testing pipeline with topic: '{test_topic}'")
    return run_pipeline_with_debug(test_topic)

# ===================================================================
# ENTRY POINT
# ===================================================================

if __name__ == "__main__":
    # Check if running in test mode
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        # Run in test mode
        test_pipeline()
    elif len(sys.argv) > 1 and sys.argv[1] == "--debug":
        # Run with debugging for a custom topic
        topic = input("Enter topic for debug run: ")
        run_pipeline_with_debug(topic)
    else:
        # Normal execution
        asyncio.run(main())