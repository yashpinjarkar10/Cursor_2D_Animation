import os
import subprocess
import shutil
from datetime import datetime
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
import re
import asyncio
from langchain_core.messages import HumanMessage, SystemMessage

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Create directories if they don't exist
os.makedirs("generated_scenes", exist_ok=True)
os.makedirs("rendered_videos", exist_ok=True)

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.1,
    api_key=GOOGLE_API_KEY
)

from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages


class State(TypedDict):
    messages: Annotated[list, add_messages]
    topic: str
    scenes: list
    manim_codes: list

def generate_scenes(state):
    """Generate scene descriptions from the user topic"""
    topic = state["topic"]
    
    system_message = SystemMessage(content="""
    You are an educational content creator. Given a topic, break it down into 3-5 smaller scenes 
    that can be animated to explain the concept clearly. Each scene should be a brief description 
    of what should be shown.
    
    Return only a numbered list of scene descriptions, one per line.
    Example format:
    1. Introduction to the concept
    2. Show the main formula
    3. Demonstrate with an example
    4. Conclusion and applications
    """)
    
    human_message = HumanMessage(content=f"Create educational scenes for the topic: {topic}")
    
    response = llm.invoke([system_message, human_message])
    
    # Parse the response to extract scene descriptions
    scenes = []
    for line in response.content.strip().split('\n'):
        if line.strip() and any(char.isdigit() for char in line[:3]):
            # Remove numbering and clean up
            scene = re.sub(r'^\d+\.\s*', '', line.strip())
            if scene:
                scenes.append(scene)
    
    return {"scenes": scenes, "messages": [response]}


async def generate_manim_code(scene_description, scene_number):
    """Generate Manim code for a single scene"""
    system_message = SystemMessage(content="""
    You are a Manim expert. Generate complete, working Manim code for the given scene description.
    The code should:
    1. Import necessary Manim components
    2. Create a Scene class named Scene{scene_num}
    3. Include a construct method with the animation
    4. Be syntactically correct and runnable
    5. Use appropriate Manim objects and animations
    
    Return only the Python code, no explanations.
    Write Manim scripts for animations in Python. Generate code, not text. Never explain code. Never add functions. Never add comments. Never infinte loops. Never use other library than Manim/math. Only complete the code block. Use variables with length of maximum 2 characters. At the end use 'self.play'.

    ```
    from manim import *
    from math import *

    class GenScene(Scene):
        def construct(self):
            # Write here

        """)
    
    human_message = HumanMessage(content=f"Scene {scene_number}: {scene_description}")
    
    response = await llm.ainvoke([system_message, human_message])
    return {
        "scene_number": scene_number,
        "description": scene_description,
        "code": response.content.strip()
    }


async def process_all_scenes(state):
    """Process all scenes in parallel to generate Manim code"""
    scenes = state["scenes"]
    
    # Create tasks for parallel processing
    tasks = [
        generate_manim_code(scene, i+1) 
        for i, scene in enumerate(scenes)
    ]
    
    # Execute all tasks in parallel
    results = await asyncio.gather(*tasks)
    
    return {"manim_codes": results}

# Build the graph
graph_builder = StateGraph(State)

# Add nodes
graph_builder.add_node("generate_scenes", generate_scenes)
graph_builder.add_node("process_scenes", process_all_scenes)

# Set up the flow
graph_builder.add_edge(START, "generate_scenes")
graph_builder.add_edge("generate_scenes", "process_scenes")
graph_builder.add_edge("process_scenes", END)

# Compile the graph
graph = graph_builder.compile()

async def run_animation_pipeline(topic):
    """Main function to run the complete pipeline"""
    initial_state = {
        "topic": topic,
        "messages": [],
        "scenes": [],
        "manim_codes": [],
    }
    
    print(f"Starting animation pipeline for topic: {topic}")
    
    # Run the graph
    result = await graph.ainvoke(initial_state)
    
    # Save generated codes to files
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    for scene_data in result["manim_codes"]:
        filename = f"scene_{scene_data['scene_number']}_{timestamp}.py"
        filepath = os.path.join("generated_scenes", filename)
        
        with open(filepath, 'w') as f:
            f.write(scene_data['code'])
        
        print(f"Generated {filename}")
        print(f"Scene: {scene_data['description']}")
        print("-" * 50)
    
    return result


# Example usage
if __name__ == "__main__":
    topic = input("Enter a topic for animation (e.g., 'Pythagorean theorem'): ")
    result = asyncio.run(run_animation_pipeline(topic))
