"""Small HTTP service for vocal/instrumental separation."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse


STORAGE_DIR = Path(os.getenv("SEPARATION_STORAGE_DIR", tempfile.gettempdir())) / "indo-separation"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

MODEL = os.getenv("DEMUCS_MODEL", "mdx_q")
DEVICE = os.getenv("DEMUCS_DEVICE")
SEGMENT = os.getenv("DEMUCS_SEGMENT", "1")
ENGINE = os.getenv("SEPARATION_ENGINE", "ffmpeg_center").strip().lower()
MDX_MODEL = os.getenv("MDX_MODEL", "UVR_MDXNET_KARA_2.onnx")
MDX_MODEL_DIR = Path(os.getenv("MDX_MODEL_DIR", str(STORAGE_DIR / "models")))
MDX_SEGMENT_SIZE = int(os.getenv("MDX_SEGMENT_SIZE", "256"))
MDX_BATCH_SIZE = int(os.getenv("MDX_BATCH_SIZE", "1"))
OUTPUT_KEY = MODEL if ENGINE == "demucs" else "mdxnet" if ENGINE == "mdxnet" else "stems"
MP3_BITRATE = int(os.getenv("DEMUCS_MP3_BITRATE", "128"))
MP3_PRESET = int(os.getenv("DEMUCS_MP3_PRESET", "7"))
MAX_UPLOAD_MB = int(os.getenv("SEPARATION_MAX_UPLOAD_MB", "50"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
JOB_TTL_SECONDS = int(os.getenv("SEPARATION_JOB_TTL_HOURS", "2")) * 60 * 60
MAX_PROCESS_SECONDS = int(os.getenv("SEPARATION_TIMEOUT_MINUTES", "30")) * 60

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"}
JOB_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
jobs: dict[str, dict[str, str]] = {}
jobs_lock = threading.Lock()

app = FastAPI(title="IndoMusika Demucs Separation API", version="1.0.0")

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "SEPARATION_CORS_ORIGINS",
        "http://localhost:8080,http://127.0.0.1:8080",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    model = MDX_MODEL if ENGINE == "mdxnet" else MODEL
    return {"status": "ok", "engine": ENGINE, "model": model}


@app.post("/api/separate")
def separate(file: UploadFile = File(...), background_tasks: BackgroundTasks = None) -> dict[str, str]:
    cleanup_expired_jobs()

    suffix = Path(file.filename or "audio.wav").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Format audio belum didukung.")

    job_id = uuid4().hex
    job_dir = STORAGE_DIR / job_id
    output_dir = job_dir / "output"
    input_path = job_dir / f"source{suffix}"
    job_dir.mkdir(parents=True, exist_ok=False)

    try:
        save_upload(file, input_path)
        with jobs_lock:
            jobs[job_id] = {"status": "queued"}
        if background_tasks is None:
            raise HTTPException(status_code=500, detail="Background job runner tidak tersedia.")
        background_tasks.add_task(process_job, job_id, input_path, output_dir, job_dir)
        return {
            "job_id": job_id,
            "status": "queued",
            "status_url": f"/api/jobs/{job_id}",
        }
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Proses AI melewati batas waktu 30 menit.") from exc
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        file.file.close()


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, str]:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise HTTPException(status_code=404, detail="Job tidak ditemukan.")

    with jobs_lock:
        job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan atau sudah kedaluwarsa.")
    return {"job_id": job_id, **job}


@app.get("/api/files/{job_id}/{stem_name}")
def download_stem(job_id: str, stem_name: str) -> FileResponse:
    if not JOB_ID_PATTERN.fullmatch(job_id) or stem_name not in {"vocals.mp3", "instrumental.mp3"}:
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")

    model_dir = STORAGE_DIR / job_id / "output" / OUTPUT_KEY / "source"
    source_name = "vocals.mp3" if stem_name == "vocals.mp3" else "no_vocals.mp3"
    path = model_dir / source_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File tidak ditemukan atau sudah kedaluwarsa.")

    return FileResponse(path, media_type="audio/mpeg", filename=stem_name)


def save_upload(file: UploadFile, destination: Path) -> None:
    total = 0
    with destination.open("wb") as output:
        while chunk := file.file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail=f"Ukuran file melebihi batas {MAX_UPLOAD_MB} MB.")
            output.write(chunk)


def process_job(job_id: str, input_path: Path, output_dir: Path, job_dir: Path) -> None:
    set_job_status(job_id, "processing")
    try:
        if ENGINE == "mdxnet":
            run_mdxnet(input_path, output_dir)
            stems_dir = output_dir / "mdxnet" / "source"
        elif ENGINE == "demucs":
            run_demucs(input_path, output_dir)
            stems_dir = output_dir / MODEL / "source"
        else:
            run_center_side_separation(input_path, output_dir)
            stems_dir = output_dir / "stems" / "source"

        vocals_path = stems_dir / "vocals.mp3"
        instrumental_path = stems_dir / "no_vocals.mp3"
        if not vocals_path.is_file() or not instrumental_path.is_file():
            set_job_status(job_id, "failed", detail="Pemisahan selesai tetapi stem output tidak ditemukan.")
            shutil.rmtree(job_dir, ignore_errors=True)
            return

        set_job_status(
            job_id,
            "complete",
            model=ENGINE,
            format="mp3",
            bitrate=str(MP3_BITRATE),
            vocals_url=f"/api/files/{job_id}/vocals.mp3",
            instrumental_url=f"/api/files/{job_id}/instrumental.mp3",
        )
    except subprocess.TimeoutExpired:
        set_job_status(job_id, "failed", detail="Proses pemisahan melewati batas waktu 30 menit.")
        shutil.rmtree(job_dir, ignore_errors=True)
    except Exception as exc:
        set_job_status(job_id, "failed", detail=str(exc))
        shutil.rmtree(job_dir, ignore_errors=True)


def run_demucs(input_path: Path, output_dir: Path) -> None:
    command = [
        sys.executable,
        "-m",
        "demucs.separate",
        "--two-stems=vocals",
        "--name",
        MODEL,
        "--out",
        str(output_dir),
        str(input_path),
    ]
    # Let Demucs auto-select MPS/CUDA when available. Set DEMUCS_DEVICE=cpu
    # explicitly for a predictable CPU-only deployment.
    if DEVICE:
        command[6:6] = ["--device", DEVICE]
    command.extend([
        "--segment",
        SEGMENT,
        "--mp3",
        "--mp3-bitrate",
        str(MP3_BITRATE),
        "--mp3-preset",
        str(MP3_PRESET),
    ])
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=MAX_PROCESS_SECONDS,
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "Demucs gagal memproses audio.")[-1200:]
        raise RuntimeError(detail)


def run_mdxnet(input_path: Path, output_dir: Path) -> None:
    """Run one MDX-Net model through audio-separator and normalize its outputs."""
    try:
        from audio_separator.separator import Separator
    except ImportError as exc:
        raise RuntimeError("Paket audio-separator belum terpasang.") from exc

    source_dir = output_dir / "mdxnet" / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    MDX_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    separator = Separator(
        output_dir=str(source_dir),
        model_file_dir=str(MDX_MODEL_DIR),
        output_format="MP3",
        output_bitrate=f"{MP3_BITRATE}k",
        mdx_params={
            "hop_length": 1024,
            "segment_size": MDX_SEGMENT_SIZE,
            "overlap": 0.25,
            "batch_size": MDX_BATCH_SIZE,
            "enable_denoise": False,
        },
    )
    separator.load_model(model_filename=MDX_MODEL)
    output_names = {"Vocals": "vocals", "Instrumental": "no_vocals"}
    generated = separator.separate(str(input_path), output_names)

    targets = {
        "vocals": source_dir / "vocals.mp3",
        "instrumental": source_dir / "no_vocals.mp3",
    }
    for generated_name in generated:
        generated_path = Path(generated_name)
        label = generated_path.stem.lower()
        target = targets["vocals"] if "vocal" in label else targets["instrumental"] if "instrument" in label or "no_vocal" in label else None
        if target is not None and generated_path.is_file() and generated_path.resolve() != target.resolve():
            shutil.move(str(generated_path), str(target))

    missing = [name for name, path in targets.items() if not path.is_file()]
    if missing:
        raise RuntimeError(f"MDX-Net tidak menghasilkan stem: {', '.join(missing)}.")


def run_center_side_separation(input_path: Path, output_dir: Path) -> None:
    source_dir = output_dir / "stems" / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    stereo_path = input_path.parent / "stereo.wav"
    run_ffmpeg(
        [
            "-y",
            "-i",
            str(input_path),
            "-ac",
            "2",
            "-ar",
            "44100",
            "-c:a",
            "pcm_s16le",
            str(stereo_path),
        ]
    )
    run_ffmpeg(
        [
            "-y",
            "-i",
            str(stereo_path),
            "-af",
            "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            f"{MP3_BITRATE}k",
            str(source_dir / "vocals.mp3"),
        ]
    )
    run_ffmpeg(
        [
            "-y",
            "-i",
            str(stereo_path),
            "-af",
            "pan=stereo|c0=0.5*c0-0.5*c1|c1=0.5*c1-0.5*c0",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            f"{MP3_BITRATE}k",
            str(source_dir / "no_vocals.mp3"),
        ]
    )


def run_ffmpeg(arguments: list[str]) -> None:
    completed = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", *arguments],
        capture_output=True,
        text=True,
        timeout=MAX_PROCESS_SECONDS,
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "FFmpeg gagal memproses audio.")[-1200:]
        raise RuntimeError(detail)


def set_job_status(job_id: str, status: str, **fields: str) -> None:
    with jobs_lock:
        jobs[job_id] = {"status": status, **fields}


def cleanup_expired_jobs() -> None:
    cutoff = time.time() - JOB_TTL_SECONDS
    for job_dir in STORAGE_DIR.iterdir():
        if job_dir.is_dir() and job_dir.stat().st_mtime < cutoff:
            shutil.rmtree(job_dir, ignore_errors=True)
