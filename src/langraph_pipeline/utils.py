import json
from datetime import datetime
from pathlib import Path

def save_result_to_file(result: dict, filename: str = None):
    """Save pipeline result to a JSON file."""
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"result_{timestamp}.json"
    
    with open(filename, 'w') as f:
        json.dump(result, f, indent=2)
    
    print(f"Result saved to {filename}")

def save_code_to_file(code: str, filename: str = None):
    """Save generated code to a Python file."""
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"generated_scene_{timestamp}.py"
    
    with open(filename, 'w') as f:
        f.write(code)
    
    print(f"Code saved to {filename}")

def validate_manim_imports(code: str) -> bool:
    """Check if code has required Manim imports."""
    required_imports = ["from manim import *", "from math import *"]
    return all(imp in code for imp in required_imports)