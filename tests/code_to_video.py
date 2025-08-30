from __future__ import annotations
import sys, shutil, subprocess, tempfile, textwrap
from pathlib import Path

def render_manim_code(topic: str) -> str:
    topic = (topic or "").strip()
    if not topic:
        raise RuntimeError("Empty topic")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found on PATH. Install ffmpeg and restart the shell.")
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        scene_name = "DynamicScene"
        script_path = workdir / "dyn_scene.py"
        script_code = textwrap.dedent(f"""
            from manim import *

            class {scene_name}(Scene):
                def construct(self):
                    txt = Text({topic!r})
                    self.play(Write(txt))
                    self.wait(1)
        """)
        script_path.write_text(script_code, encoding="utf-8")

        cmd = [
            sys.executable, "-m", "manim",
            "-q", "h",
            str(script_path),
            scene_name,
            "--format=mp4",
            "--output_file", "render.mp4",
            "--media_dir", str(workdir),
        ]
        try:
            cp = subprocess.run(
                cmd, check=True, cwd=workdir,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
        except FileNotFoundError as e:
            raise RuntimeError("Python or Manim not found in this venv. Activate venv and `pip install manim manimpango`.") from e
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Manim failed:\n{e.stderr or e.stdout}") from e

        # Find the MP4 Manim produced
        video_path = None
        for p in workdir.rglob("render.mp4"):
            video_path = p
            break
        if not video_path:
            for p in workdir.rglob("*.mp4"):
                video_path = p
                break
        if not video_path:
            raise RuntimeError("Rendered file not found.")
        out_dir = (Path(__file__).resolve().parent / "output")
        out_dir.mkdir(parents=True, exist_ok=True)
        final = out_dir / f"{scene_name}.mp4"
        final.write_bytes(video_path.read_bytes())
        return str(final)