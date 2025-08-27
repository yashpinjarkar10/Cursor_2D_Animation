# ===================================================================
# STATE DEFINITION MODULE
# ===================================================================
"""
State definitions for the 2D Animation Pipeline.

This module contains the TypedDict definitions used throughout
the LangGraph pipeline for state management.
"""

from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages

# ===================================================================
# PIPELINE STATE
# ===================================================================

class State(TypedDict):
    """
    State definition for the LangGraph pipeline.
    
    This class defines the structure of the state object that flows
    through the entire animation generation pipeline.
    
    Attributes:
        messages: List of messages for conversation history and LLM interactions
        topic: The main educational topic to create animations for
        scenes: List of scene descriptions generated from the topic
        manim_codes: List of generated Manim code dictionaries for each scene
    """
    messages: Annotated[list, add_messages]
    topic: str
    scenes: list
    manim_codes: list

# ===================================================================
# UTILITY STATE FUNCTIONS
# ===================================================================

def create_initial_state(topic: str) -> State:
    """
    Create an initial state object for the pipeline.
    
    Args:
        topic: The educational topic to process
        
    Returns:
        State: Initialized state object ready for pipeline execution
    """
    return {
        "topic": topic,
        "messages": [],
        "scenes": [],
        "manim_codes": [],
    }

def validate_state(state: State) -> bool:
    """
    Validate that a state object has the required structure.
    
    Args:
        state: State object to validate
        
    Returns:
        bool: True if state is valid, False otherwise
    """
    required_keys = {"messages", "topic", "scenes", "manim_codes"}
    return all(key in state for key in required_keys)