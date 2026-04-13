# Chess Arena Worker Publisher
# Usage: .\publish_worker.ps1 [DockerHubUsername]

$USERNAME = $args[0]

if (-not $USERNAME) {
    Write-Host "Usage: .\publish_worker.ps1 [DockerHubUsername]" -ForegroundColor Red
    Write-Host "Example: .\publish_worker.ps1 jaymaart"
    exit
}

$IMAGE_NAME = "$USERNAME/chess-worker:latest"

Write-Host "--- 🏗️ Building Worker Image: $IMAGE_NAME ---" -ForegroundColor Cyan
docker build -t $IMAGE_NAME -f apps/worker/Dockerfile .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit
}

Write-Host "--- ☁️ Pushing to Docker Hub ---" -ForegroundColor Cyan
docker push $IMAGE_NAME

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Push failed! Are you logged in? (Run 'docker login')" -ForegroundColor Red
    exit
}

Write-Host "--- ✅ Successfully Published! ---" -ForegroundColor Green
Write-Host "You can now pull this on your 5070 PC or share it with others."
