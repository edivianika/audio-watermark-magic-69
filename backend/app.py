"""Small Demucs HTTP service for AI vocal/instrumental separation."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse


STORAGE_DIR = Path(os.getenv("SEPARATION_STORAGE_DIR", tempfile.gettempdir())) / "indo-separation"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

MODEL = os.getenv("DEMUCS_MODEL", "htdemucs")
DEVICE = os.getenv("DEMUCS_DEVICE")
MP3_BITRATE = int(os.getenv("DEMUCS_MP3_BITRATE", "128"))
MP3_PRESET = int(os.getenv("DEMUCS_MP3_PRESET", "7"))
MAX_UPLOAD_MB = int(os.getenv("SEPARATION_MAX_UPLOAD_MB", "50"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
JOB_TTL_SECONDS = int(os.getenv("SEPARATION_JOB_TTL_HOURS", "2")) * 60 * 60
MAX_PROCESS_SECONDS = int(os.getenv("SEPARATION_TIMEOUT_MINUTES", "30")) * 60

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"}
JOB_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")

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
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL}


@app.post("/api/separate")
def separate(file: UploadFile = File(...)) -> dict[str, str]:
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
        command.extend(["--mp3", "--mp3-bitrate", str(MP3_BITRATE), "--mp3-preset", str(MP3_PRESET)])
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=MAX_PROCESS_SECONDS,
            check=False,
        )
        if completed.returncode != 0:
            error_tail = (completed.stderr or completed.stdout or "Demucs gagal memproses audio.")[-1200:]
            raise HTTPException(status_code=502, detail=error_tail)

        vocals_path = output_dir / MODEL / "source" / "vocals.mp3"
        instrumental_path = output_dir / MODEL / "source" / "no_vocals.mp3"
        if not vocals_path.is_file() or not instrumental_path.is_file():
            raise HTTPException(status_code=502, detail="Demucs selesai tetapi stem output tidak ditemukan.")

        return {
            "job_id": job_id,
            "model": MODEL,
            "format": "mp3",
            "bitrate": str(MP3_BITRATE),
            "vocals_url": f"/api/files/{job_id}/vocals.mp3",
            "instrumental_url": f"/api/files/{job_id}/instrumental.mp3",
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


@app.get("/api/files/{job_id}/{stem_name}")
def download_stem(job_id: str, stem_name: str) -> FileResponse:
    if not JOB_ID_PATTERN.fullmatch(job_id) or stem_name not in {"vocals.mp3", "instrumental.mp3"}:
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")

    model_dir = STORAGE_DIR / job_id / "output" / MODEL / "source"
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


def cleanup_expired_jobs() -> None:
    cutoff = time.time() - JOB_TTL_SECONDS
    for job_dir in STORAGE_DIR.iterdir():
        if job_dir.is_dir() and job_dir.stat().st_mtime < cutoff:
            shutil.rmtree(job_dir, ignore_errors=True)
