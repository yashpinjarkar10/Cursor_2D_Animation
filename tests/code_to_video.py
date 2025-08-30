import tempfile
import subprocess
import shutil
import os
from demo_code_generation import get_code

def render_manim_code(query: str, output_file: str = 'rendered_video.mp4'):
    code = get_code(query)
    # Create temporary file for the Manim code
    with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as tmp:
        tmp.write(code.encode('utf-8'))
        tmp_file = tmp.name
    
    scene_name = 'CreateCircle'  # The name of the scene class in the code
    
    quality_flag = '-ql'  # Low quality for faster rendering; change to '-qm', '-qh', or '-qk' as needed
    
    # Execute Manim to render the scene
    cmd = ['manim', quality_flag, tmp_file, scene_name]
    subprocess.run(cmd, check=True)
    
    # Determine the default output path created by Manim
    module_name = os.path.basename(tmp_file)[:-3]  # Remove '.py'
    if 'l' in quality_flag:
        quality_dir = '480p15'
    elif 'm' in quality_flag:
        quality_dir = '720p30'
    elif 'h' in quality_flag:
        quality_dir = '1080p60'
    elif 'k' in quality_flag:
        quality_dir = '2160p60'
    else:
        quality_dir = '480p15'  # Default fallback
    
    default_dir = os.path.join('media', 'videos', module_name, quality_dir)
    default_file = os.path.join(default_dir, scene_name + '.mp4')
    
    # Move the rendered video to the desired output file
    os.makedirs(os.path.dirname(output_file) or '.', exist_ok=True)
    shutil.move(default_file, output_file)
    
    # Clean up temporary file (media directory remains as is)
    os.remove(tmp_file)
    
    print(f"Rendered video saved to {os.path.abspath(output_file)}")

