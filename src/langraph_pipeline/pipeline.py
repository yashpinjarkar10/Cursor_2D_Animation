# ===================================================================
# PIPELINE MODULE
# ===================================================================
"""
Pipeline orchestration module for the 2D Animation Pipeline.

This module contains the LangGraph pipeline setup and execution
logic for the complete animation generation workflow.
"""

import os
from datetime import datetime
from langgraph.graph import StateGraph, START, END
from state import State, create_initial_state
from scene_generator import generate_scenes
from manim_generator import process_all_scenes

# ===================================================================
# PIPELINE SETUP
# ===================================================================

def create_pipeline():
    """
    Create and configure the main LangGraph pipeline.
    
    Sets up the complete workflow from topic input to Manim code generation,
    including scene generation and parallel code processing.
    
    Returns:
        Compiled LangGraph instance ready for execution
    """
    # Build the main pipeline graph
    graph_builder = StateGraph(State)

    # Add pipeline nodes
    graph_builder.add_node("generate_scenes", generate_scenes)
    graph_builder.add_node("process_scenes", process_all_scenes)

    # Set up the execution flow
    graph_builder.add_edge(START, "generate_scenes")
    graph_builder.add_edge("generate_scenes", "process_scenes")
    graph_builder.add_edge("process_scenes", END)

    # Compile the graph for execution
    return graph_builder.compile()

# ===================================================================
# PIPELINE EXECUTION
# ===================================================================

async def run_animation_pipeline(topic):
    """
    Main function to run the complete animation pipeline.
    
    This function orchestrates the entire process from topic input
    to generating Manim code files for all scenes.
    
    Args:
        topic: The educational topic to create animations for
        
    Returns:
        Complete pipeline result with scenes and generated codes
    """
    # Initialize pipeline state
    initial_state = create_initial_state(topic)
    
    print(f"Starting animation pipeline for topic: {topic}")
    
    # Create and execute the pipeline
    graph = create_pipeline()
    result = await graph.ainvoke(initial_state)
    
    # Save generated codes to files
    save_generated_codes(result["manim_codes"])
    
    return result

def save_generated_codes(manim_codes):
    """
    Save generated Manim codes to individual files.
    
    Creates timestamped files in the generated_scenes directory
    and displays progress information to the user.
    
    Args:
        manim_codes: List of generated code dictionaries
    """
    # Create timestamp for unique filenames
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    for scene_data in manim_codes:
        filename = f"scene_{scene_data['scene_number']}_{timestamp}.py"
        filepath = os.path.join("generated_scenes", filename)
        
        # Write generated code to file
        with open(filepath, 'w') as f:
            f.write(scene_data['code'])
        
        # Display progress information
        print(f"Generated {filename}")
        print(f"Scene: {scene_data['description']}")
        print("-" * 50)

# ===================================================================
# PIPELINE UTILITIES
# ===================================================================

def validate_pipeline_result(result):
    """
    Validate that the pipeline execution completed successfully.
    
    Args:
        result: Pipeline execution result
        
    Returns:
        bool: True if result is valid, False otherwise
    """
    required_keys = {"topic", "scenes", "manim_codes"}
    return (
        isinstance(result, dict) and
        all(key in result for key in required_keys) and
        len(result["scenes"]) > 0 and
        len(result["manim_codes"]) > 0
    )

def get_pipeline_summary(result):
    """
    Generate a summary of the pipeline execution results.
    
    Args:
        result: Pipeline execution result
        
    Returns:
        dict: Summary information about the execution
    """
    return {
        "topic": result.get("topic", "Unknown"),
        "total_scenes": len(result.get("scenes", [])),
        "generated_codes": len(result.get("manim_codes", [])),
        "success": validate_pipeline_result(result)
    }