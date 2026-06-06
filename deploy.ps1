# ============================================================
# Steam Achievement Optimizer - Kubernetes Deployment Script
# ============================================================
$ErrorActionPreference = "Stop"

Write-Host "=== Steam Achievement Optimizer - K8s Deployment ===" -ForegroundColor Cyan
Write-Host ""

function Read-DotEnv {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path $Path)) {
        return $values
    }

    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $parts = $trimmed -split "=", 2
        if ($parts.Count -ne 2) {
            continue
        }

        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $values[$key] = $value
    }

    return $values
}

function Get-ConfigValue {
    param(
        [hashtable]$Values,
        [string]$Key,
        [string]$Default = "",
        [switch]$Required
    )

    if ($Values.ContainsKey($Key) -and $Values[$Key]) {
        return $Values[$Key]
    }

    if ($Required) {
        Write-Host "[FAILED] Missing required value '$Key' in .env" -ForegroundColor Red
        exit 1
    }

    return $Default
}

function ConvertTo-Base64 {
    param([string]$Value)
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Value))
}

function Write-YamlString {
    param(
        [string]$Key,
        [string]$Value
    )

    $encoded = ConvertTo-Base64 -Value $Value
    return "  ${Key}: $encoded"
}

function Apply-SecretsFromEnv {
    $envValues = Read-DotEnv -Path (Join-Path $PSScriptRoot ".env")

    $secretValues = [ordered]@{
        MYSQL_USER          = Get-ConfigValue -Values $envValues -Key "MYSQL_USER" -Default "steam_user"
        MYSQL_PASSWORD      = Get-ConfigValue -Values $envValues -Key "MYSQL_PASSWORD" -Required
        MYSQL_ROOT_PASSWORD = Get-ConfigValue -Values $envValues -Key "MYSQL_ROOT_PASSWORD" -Required
        FLASK_SECRET_KEY    = Get-ConfigValue -Values $envValues -Key "FLASK_SECRET_KEY" -Required
        STEAM_API_KEY       = Get-ConfigValue -Values $envValues -Key "STEAM_API_KEY" -Required
        STEAMGRIDDB_API_KEY = Get-ConfigValue -Values $envValues -Key "STEAMGRIDDB_API_KEY" -Default ""
        GEMINI_API_KEY      = Get-ConfigValue -Values $envValues -Key "GEMINI_API_KEY" -Default ""
    }

    $secretPath = Join-Path ([System.IO.Path]::GetTempPath()) "steam-optimizer-secrets.yaml"
    $yaml = @(
        "apiVersion: v1",
        "kind: Secret",
        "metadata:",
        "  name: steam-optimizer-secrets",
        "  namespace: steam-optimizer",
        "  labels:",
        "    app.kubernetes.io/name: steam-optimizer",
        "type: Opaque",
        "data:"
    )

    foreach ($entry in $secretValues.GetEnumerator()) {
        $yaml += Write-YamlString -Key $entry.Key -Value $entry.Value
    }

    Set-Content -Path $secretPath -Value $yaml -Encoding ascii
    try {
        $applyOutput = kubectl apply -f $secretPath 2>&1
        $applyExitCode = $LASTEXITCODE
        if ($applyOutput) {
            $applyOutput | ForEach-Object { Write-Host "  $_" }
        }

        return $applyExitCode
    }
    finally {
        Remove-Item -LiteralPath $secretPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-ShortSha256 {
    param([string]$Value)

    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
        $hashBytes = $sha256.ComputeHash($bytes)
        $hash = (($hashBytes | ForEach-Object { $_.ToString("x2") }) -join "")
        return $hash.Substring(0, 12)
    }
    finally {
        $sha256.Dispose()
    }
}

function Get-MySqlDataPath {
    $envValues = Read-DotEnv -Path (Join-Path $PSScriptRoot ".env")
    $mysqlUser = Get-ConfigValue -Values $envValues -Key "MYSQL_USER" -Default "steam_user"
    $mysqlPassword = Get-ConfigValue -Values $envValues -Key "MYSQL_PASSWORD" -Required
    $mysqlRootPassword = Get-ConfigValue -Values $envValues -Key "MYSQL_ROOT_PASSWORD" -Required
    $credentialHash = Get-ShortSha256 -Value "$mysqlUser`n$mysqlPassword`n$mysqlRootPassword"

    return "/tmp/steam-optimizer/mysql-data-$credentialHash-v2"
}

function Apply-MySqlManifests {
    $mysqlDataPath = Get-MySqlDataPath
    $mysqlDir = Join-Path $PSScriptRoot "k8s\mysql"
    $pvTemplatePath = Join-Path $mysqlDir "pv.yaml"
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "steam-optimizer-mysql"
    $tempPvPath = Join-Path $tempDir "pv.yaml"

    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    $pvYaml = Get-Content -Path $pvTemplatePath -Raw
    $pvYaml = $pvYaml.Replace("path: /tmp/steam-optimizer/mysql-data", "path: $mysqlDataPath")

    Set-Content -Path $tempPvPath -Value $pvYaml -Encoding ascii

    Write-Host "  Using MySQL data path: $mysqlDataPath"

    try {
        $applyOutput = kubectl apply -f $tempPvPath 2>&1
        $applyExitCode = $LASTEXITCODE
        if ($applyOutput) {
            $applyOutput | ForEach-Object { Write-Host "  $_" }
        }

        if ($applyExitCode -ne 0) {
            return $applyExitCode
        }

        foreach ($manifest in @("pvc.yaml", "service.yaml", "deployment.yaml")) {
            $manifestPath = Join-Path $mysqlDir $manifest
            $applyOutput = kubectl apply -f $manifestPath 2>&1
            $applyExitCode = $LASTEXITCODE
            if ($applyOutput) {
                $applyOutput | ForEach-Object { Write-Host "  $_" }
            }

            if ($applyExitCode -ne 0) {
                return $applyExitCode
            }
        }

        return 0
    }
    finally {
        Remove-Item -LiteralPath $tempPvPath -Force -ErrorAction SilentlyContinue
    }
}

# -----------------------------------------------------------
# Step 0: Pre-deployment cleanup (fix stuck resources)
# -----------------------------------------------------------
Write-Host "[0/4] Pre-deployment cleanup..." -ForegroundColor Yellow

# Check if namespace exists and clean up stuck resources
$originalErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"

$nsExists = kubectl get namespace steam-optimizer -o name 2>&1
$ErrorActionPreference = $originalErrorAction

if ($LASTEXITCODE -eq 0) {
    Write-Host "Previous deployment found, cleaning up resources..."
    
    # Delete old namespace (this cascades to delete all resources including PVCs)
    Write-Host "  Deleting previous steam-optimizer namespace..."
    kubectl delete namespace steam-optimizer --ignore-not-found=true 2>&1 | Out-Null
    
    # Wait for namespace deletion to complete
    Write-Host "  Waiting for namespace cleanup to complete (this may take 30 seconds)..."
    $maxWait = 30
    $waited = 0
    
    while ($waited -lt $maxWait) {
        $ErrorActionPreference = "Continue"
        $check = kubectl get namespace steam-optimizer -o name 2>&1
        $ErrorActionPreference = $originalErrorAction
        
        if ($LASTEXITCODE -ne 0) {
            break
        }
        Start-Sleep -Seconds 1
        $waited++
    }
    
    if ($waited -ge $maxWait) {
        Write-Host "  [WARNING] Namespace deletion took longer than expected, continuing anyway..." -ForegroundColor Yellow
    }
    else {
        Write-Host "  Cleanup complete" -ForegroundColor Green
    }
}
else {
    Write-Host "No previous deployment found, starting fresh" -ForegroundColor Green
}

Write-Host "  Checking for stuck PersistentVolumes..."
$pvs = kubectl get pv -o name 2>&1 | Select-String "mysql-pv"
if ($pvs) {
    Write-Host "  Deleting stuck PersistentVolume (mysql-pv)..."
    kubectl delete pv mysql-pv --ignore-not-found=true 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

Write-Host ""

# -----------------------------------------------------------
# Step 1: Build Docker images (using local Docker daemon)
# -----------------------------------------------------------
Write-Host "[1/4] Building Docker images..." -ForegroundColor Yellow

# Verify Docker daemon is running
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker daemon not responding"
    }
}
catch {
    Write-Host "[FAILED] Docker daemon is not running or not accessible" -ForegroundColor Red
    Write-Host "  Please ensure Docker Desktop is running and try again" -ForegroundColor Yellow
    exit 1
}

# Build database image
Write-Host "  Building database image..."
docker build -t steam-optimizer-db ./database
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAILED] Failed to build database image" -ForegroundColor Red
    exit 1
}

# Build backend image
Write-Host "  Building backend image..."
docker build -t steam-optimizer-backend ./backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAILED] Failed to build backend image" -ForegroundColor Red
    exit 1
}

# Build frontend image
Write-Host "  Building frontend image..."
docker build -t steam-optimizer-frontend ./frontend
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAILED] Failed to build frontend image" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] All images built successfully" -ForegroundColor Green
Write-Host ""

# -----------------------------------------------------------
# Step 2: Create namespace and config
# -----------------------------------------------------------
# -----------------------------------------------------------
# Step 2: Create namespace and config
# -----------------------------------------------------------
Write-Host "[2/4] Applying namespace, configmap, and secrets..." -ForegroundColor Yellow

# Verify kubectl is available and connected to cluster
try {
    $kubectlInfo = kubectl cluster-info 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "kubectl not connected to cluster"
    }
}
catch {
    Write-Host "[FAILED] kubectl is not available or not connected to a Kubernetes cluster" -ForegroundColor Red
    Write-Host "  Please ensure kubectl is installed and configured correctly" -ForegroundColor Yellow
    exit 1
}

Write-Host "  Creating namespace..."
kubectl apply -f k8s/namespace.yaml
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAILED] Failed to create namespace" -ForegroundColor Red
    exit 1
}

Write-Host "  Waiting for namespace to be ready..."
Start-Sleep -Seconds 2

Write-Host "  Applying configmap..."
kubectl apply -f k8s/configmap.yaml
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAILED] Failed to apply configmap" -ForegroundColor Red
    exit 1
}

Write-Host "  Applying secrets from .env..."
$secretsExitCode = Apply-SecretsFromEnv
if ($secretsExitCode -ne 0) {
    Write-Host "[FAILED] Failed to apply secrets" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Namespace, configmap, and secrets created" -ForegroundColor Green
Write-Host ""

# -----------------------------------------------------------
# Step 3: Deploy services
# -----------------------------------------------------------
# -----------------------------------------------------------
# Step 3: Deploy services
# -----------------------------------------------------------
Write-Host "[3/4] Deploying services..." -ForegroundColor Yellow

# Helper function to wait for pod with retry logic
function Wait-ForPod {
    param(
        [string]$Selector,
        [string]$ComponentName,
        [int]$TimeoutSeconds = 300
    )
    
    Write-Host "  Waiting for $ComponentName to be ready (timeout: ${TimeoutSeconds}s)..."
    
    $startTime = Get-Date
    $maxRetries = 3
    $retryCount = 0
    
    while ($retryCount -lt $maxRetries) {
        kubectl wait --namespace=steam-optimizer `
            --for=condition=ready pod `
            --selector=$Selector `
            --timeout=${TimeoutSeconds}s 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [OK] $ComponentName is ready" -ForegroundColor Green
            return $true
        }
        
        $retryCount++
        if ($retryCount -lt $maxRetries) {
            Write-Host "  [WARNING] Retry attempt $retryCount/$($maxRetries - 1) in 5 seconds..." -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    }
    
    return $false
}

function Test-LocalPort {
    param([int]$Port)

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $asyncResult = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $asyncResult.AsyncWaitHandle.WaitOne(500, $false)) {
            return $false
        }

        $client.EndConnect($asyncResult)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Stop-ExistingPortForward {
    param([string]$ServiceName)

    $existing = Get-CimInstance Win32_Process -Filter "name = 'kubectl.exe'" 2>$null |
    Where-Object {
        $_.CommandLine -match "port-forward" -and
        $_.CommandLine -match "steam-optimizer" -and
        $_.CommandLine -match "svc/$ServiceName"
    }

    foreach ($process in $existing) {
        Write-Host "  Stopping existing port-forward for $ServiceName (PID $($process.ProcessId))..."
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Start-PortForward {
    param(
        [string]$ServiceName,
        [int]$LocalPort,
        [int]$RemotePort
    )

    Stop-ExistingPortForward -ServiceName $ServiceName
    Start-Sleep -Milliseconds 500

    if (Test-LocalPort -Port $LocalPort) {
        Write-Host "  localhost:$LocalPort is currently in use; waiting for it to clear..."
        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Milliseconds 500
            if (-not (Test-LocalPort -Port $LocalPort)) {
                break
            }
        }

        if (Test-LocalPort -Port $LocalPort) {
            Write-Host "  [WARNING] localhost:$LocalPort is still in use. Skipping $ServiceName port-forward." -ForegroundColor Yellow
            return $false
        }
    }

    $logDir = Join-Path $PSScriptRoot ".deploy-logs"
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null

    $stdoutLog = Join-Path $logDir "$ServiceName-port-forward.out.log"
    $stderrLog = Join-Path $logDir "$ServiceName-port-forward.err.log"
    $arguments = @(
        "port-forward",
        "-n",
        "steam-optimizer",
        "svc/$ServiceName",
        "${LocalPort}:${RemotePort}"
    )

    Write-Host "  Forwarding localhost:$LocalPort -> svc/${ServiceName}:$RemotePort..."
    $process = Start-Process -FilePath "kubectl" `
        -ArgumentList $arguments `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 250
        if ($process.HasExited) {
            Write-Host "  [FAILED] Port-forward for $ServiceName exited early. See $stderrLog" -ForegroundColor Red
            return $false
        }

        if (Test-LocalPort -Port $LocalPort) {
            Write-Host "  [OK] localhost:$LocalPort is ready" -ForegroundColor Green
            return $true
        }
    }

    Write-Host "  [WARNING] Port-forward for $ServiceName started, but localhost:$LocalPort did not respond yet." -ForegroundColor Yellow
    Write-Host "            Logs: $stderrLog" -ForegroundColor Yellow
    return $false
}

# Deploy MySQL
Write-Host "Deploying MySQL..."
$mysqlExitCode = Apply-MySqlManifests
if ($mysqlExitCode -ne 0) {
    Write-Host "[FAILED] Failed to deploy MySQL" -ForegroundColor Red
    exit 1
}

if (-not (Wait-ForPod -Selector "app.kubernetes.io/component=database" -ComponentName "MySQL" -TimeoutSeconds 300)) {
    Write-Host "[FAILED] MySQL failed to become ready after multiple attempts" -ForegroundColor Red
    Write-Host "Diagnostic information:" -ForegroundColor Yellow
    kubectl describe pod -n steam-optimizer -l app.kubernetes.io/component=database
    kubectl logs -n steam-optimizer -l app.kubernetes.io/component=database --tail=20 2>$null
    exit 1
}

Write-Host ""

# Deploy Backend
Write-Host "Deploying Backend..."
kubectl apply -f k8s/backend/
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAILED] Failed to deploy Backend" -ForegroundColor Red
    exit 1
}

if (-not (Wait-ForPod -Selector "app.kubernetes.io/component=backend" -ComponentName "Backend" -TimeoutSeconds 300)) {
    Write-Host "[FAILED] Backend failed to become ready" -ForegroundColor Red
    Write-Host "Diagnostic information:" -ForegroundColor Yellow
    kubectl describe pod -n steam-optimizer -l app.kubernetes.io/component=backend
    kubectl logs -n steam-optimizer -l app.kubernetes.io/component=backend --tail=20 2>$null
    exit 1
}

Write-Host ""

# Deploy Frontend
Write-Host "Deploying Frontend..."
kubectl apply -f k8s/frontend/
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAILED] Failed to deploy Frontend" -ForegroundColor Red
    exit 1
}

if (-not (Wait-ForPod -Selector "app.kubernetes.io/component=frontend" -ComponentName "Frontend" -TimeoutSeconds 120)) {
    Write-Host "[FAILED] Frontend failed to become ready" -ForegroundColor Red
    Write-Host "Diagnostic information:" -ForegroundColor Yellow
    kubectl describe pod -n steam-optimizer -l app.kubernetes.io/component=frontend
    kubectl logs -n steam-optimizer -l app.kubernetes.io/component=frontend --tail=20 2>$null
    exit 1
}

Write-Host ""
Write-Host "[OK] All services deployed successfully" -ForegroundColor Green
Write-Host ""

# -----------------------------------------------------------
# Step 4: Status summary
# -----------------------------------------------------------
Write-Host "[4/4] Deployment status:" -ForegroundColor Yellow
Write-Host ""
kubectl get all -n steam-optimizer
Write-Host ""

# Verify all pods are running
$runningPodsCount = @(kubectl get pods -n steam-optimizer --field-selector status.phase=Running --no-headers 2>$null).Count
$totalPodsCount = @(kubectl get pods -n steam-optimizer --no-headers 2>$null).Count

Write-Host ""
Write-Host "Starting local port-forwards..." -ForegroundColor Yellow
$frontendForwarded = Start-PortForward -ServiceName "frontend" -LocalPort 3000 -RemotePort 3000
$backendForwarded = Start-PortForward -ServiceName "backend" -LocalPort 5000 -RemotePort 5000

Write-Host ""
Write-Host "=== Deployment Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Pod Status: $runningPodsCount / $totalPodsCount running" -ForegroundColor Green
Write-Host ""
Write-Host "Access the application:" -ForegroundColor Cyan
if ($frontendForwarded) {
    Write-Host "  Frontend:    http://localhost:3000"
}
else {
    Write-Host "  Frontend:    kubectl port-forward -n steam-optimizer svc/frontend 3000:3000" -ForegroundColor Yellow
}

if ($backendForwarded) {
    Write-Host "  Backend API: http://localhost:5000/api/health"
}
else {
    Write-Host "  Backend API: kubectl port-forward -n steam-optimizer svc/backend 5000:5000" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Quick commands:" -ForegroundColor Cyan
Write-Host "  View pods:    kubectl get pods -n steam-optimizer"
Write-Host "  View logs:    kubectl logs -n steam-optimizer -l app=backend --tail=50"
Write-Host "  Scale:        kubectl scale deployment backend -n steam-optimizer --replicas=4"
Write-Host "  Stop access:  Get-CimInstance Win32_Process -Filter `"name = 'kubectl.exe'`" | Where-Object { `$_.CommandLine -match 'port-forward' -and `$_.CommandLine -match 'steam-optimizer' } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force }"
Write-Host "  Teardown:     kubectl delete namespace steam-optimizer"
Write-Host ""
Write-Host "Troubleshooting:" -ForegroundColor Cyan
Write-Host "  Pod details:  kubectl describe pod -n steam-optimizer <pod-name>"
Write-Host "  Full logs:    kubectl logs -n steam-optimizer -l app=<app> -f"
Write-Host ""
