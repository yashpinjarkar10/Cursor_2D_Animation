# ===================================================================
# SCENE GENERATOR MODULE
# ===================================================================
"""
Scene generation module for the 2D Animation Pipeline.

This module handles the breakdown of educational topics into
individual scene descriptions that can be animated.
"""

import re
from langchain_core.messages import HumanMessage, SystemMessage
from config import SCENE_GENERATION_PROMPT

# ===================================================================
# SCENE GENERATION FUNCTIONS
# ===================================================================

def generate_scenes(state):
    """
    Generate scene descriptions from the user topic.
    
    Takes a topic and breaks it down into multiple educational scenes
    that can be animated to explain the concept clearly.
    
    Args:
        state: Current pipeline state containing the topic
        
    Returns:
        Dictionary with updated scenes list and response messages
    """
    topic = state["topic"]
    
    # Import LLM here to avoid circular imports
    from config import initialize_llm
    llm = initialize_llm()
    
    # System prompt for scene generation
    system_message = SystemMessage(content=SCENE_GENERATION_PROMPT)
    human_message = HumanMessage(content=f"Create educational scenes for the topic: {topic}")
    
    # Generate response from LLM
    response = llm.invoke([system_message, human_message])
    
    # Parse the response to extract scene descriptions
    scenes = parse_scene_descriptions(response.content)
    
    return {"scenes": scenes, "messages": [response]}

def parse_scene_descriptions(content: str) -> list:
    """
    Parse scene descriptions from LLM response content.
    
    Extracts numbered scene descriptions and cleans them up
    by removing numbering and extra whitespace.
    
    Args:
        content: Raw content from LLM response
        
    Returns:
        list: Clean list of scene descriptions
    """
    scenes = []
    
    for line in content.strip().split('\n'):
        if line.strip() and any(char.isdigit() for char in line[:3]):
            # Remove numbering and clean up
            scene = re.sub(r'^\d+\.\s*', '', line.strip())
            if scene:
                scenes.append(scene)
    
    return scenes

def validate_scenes(scenes: list) -> bool:
    """
    Validate that the generated scenes list is proper.
    
    Args:
        scenes: List of scene descriptions
        
    Returns:
        bool: True if scenes are valid, False otherwise
    """
    return isinstance(scenes, list) and len(scenes) > 0 and all(isinstance(scene, str) and scene.strip() for scene in scenes)