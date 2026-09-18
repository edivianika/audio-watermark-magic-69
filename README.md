# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/3cf64d30-c7f8-4f71-b9c9-2543244d0a93

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/3cf64d30-c7f8-4f71-b9c9-2543244d0a93) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with .

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/3cf64d30-c7f8-4f71-b9c9-2543244d0a93) and click on Share -> Publish.

## AI vocal separation backend

The `Split Vocal` tab uses a small Python service backed by Demucs. It returns MP3 stems at 128 kbps by default, which keeps downloads much smaller than WAV while preserving convenient preview quality. Start it locally with Python 3.11+:

```sh
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

Set `VITE_SEPARATION_API_URL=http://127.0.0.1:8000` in the frontend environment. The first Demucs run downloads the selected model; use Docker with `backend/Dockerfile` for a reproducible deployment.

Set `DEMUCS_DEVICE=cpu` when a deployment has no GPU/MPS device. The deployment defaults to the lighter quantized `mdx_q` model with `DEMUCS_SEGMENT=1` to keep CPU/memory usage practical on Render free tier. Change `DEMUCS_MODEL` and `DEMUCS_SEGMENT` only when the service has enough memory. Change `DEMUCS_MP3_BITRATE` to `96`, `128`, or `160` to trade file size against quality.

## Deployment

The Vite frontend is configured for Vercel through `vercel.json`. Set `VITE_SEPARATION_API_URL` in Vercel to the public Render URL of the backend, for example `https://indo-audio-separation-api.onrender.com`.

The Demucs backend is configured for Render through `render.yaml` and `backend/Dockerfile`. Set `SEPARATION_CORS_ORIGINS` on Render to the deployed Vercel URL, then deploy the frontend so its browser requests are allowed by the API.

## I want to use a custom domain - is that possible?

We don't support custom domains (yet). If you want to deploy your project under your own domain then we recommend using Netlify. Visit our docs for more details: [Custom domains](https://docs.lovable.dev/tips-tricks/custom-domain/)
