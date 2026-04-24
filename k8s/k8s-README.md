# Kubernetes — Deployment Manifests

This folder contains all **Kubernetes manifests** needed to deploy the Steam Achievement Optimizer to a Kubernetes cluster. The default configuration targets **Docker Desktop's built-in Kubernetes**, but the manifests can be adapted for any K8s environment.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Prerequisites](#prerequisites)
5. [Manifests Reference](#manifests-reference)
6. [Deployment Guide](#deployment-guide)
7. [Configuration](#configuration)
8. [Resource Limits](#resource-limits)
9. [Health Checks](#health-checks)
10. [Networking](#networking)
11. [Storage](#storage)
12. [Scaling & Self-Healing](#scaling--self-healing)
13. [Troubleshooting](#troubleshooting)

---

## Overview

The K8s deployment creates:
- A dedicated `steam-optimizer` **namespace** for isolation
- A **ConfigMap** for non-sensitive configuration
- A **Secret** for credentials (API keys, passwords)
- **MySQL** with persistent storage (1 replica, Recreate strategy)
- **Backend** Flask API (2 replicas, RollingUpdate)
- **Frontend** nginx SPA (2 replicas, RollingUpdate, NodePort access)
- An **Ingress** placeholder for production domain routing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Namespace: steam-optimizer                    │
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐    ┌──────────────────┐  │
│  │   Frontend    │    │   Backend    │    │      MySQL       │  │
│  │  (2 replicas) │───▶│ (2 replicas) │───▶│   (1 replica)    │  │
│  │   nginx:3000  │    │  flask:5000  │    │     mysql:3306   │  │
│  └──────┬───────┘     └──────────────┘    └────────┬─────────┘  │
│         │             ClusterIP svc               │             │
│    NodePort:30000     ClusterIP svc         PVC ──┤             │
│                                                   ▼             │
│                                             PV (hostPath)       │
└─────────────────────────────────────────────────────────────────┘

External access: http://localhost:30000
```

---

## Directory Structure

```
k8s/
├── namespace.yaml              # Creates the steam-optimizer namespace
├── configmap.yaml              # Non-sensitive config (hostnames, ports, model name)
├── secrets.yaml                # Credentials (base64-encoded, replace before deploying)
├── ingress.yaml                # Ingress placeholder for production domain + TLS
│
├── mysql/                      # Database tier
│   ├── pv.yaml                 # PersistentVolume (5Gi, hostPath)
│   ├── pvc.yaml                # PersistentVolumeClaim (5Gi)
│   ├── deployment.yaml         # MySQL 8.0 Deployment (1 replica, Recreate)
│   └── service.yaml            # ClusterIP Service on port 3306
│
├── backend/                    # API tier
│   ├── deployment.yaml         # Flask API Deployment (2 replicas, RollingUpdate)
│   └── service.yaml            # ClusterIP Service on port 5000
│
└── frontend/                   # Web tier
    ├── configmap.yaml          # nginx.conf injected as ConfigMap
    ├── deployment.yaml         # nginx Deployment (2 replicas, RollingUpdate)
    └── service.yaml            # NodePort Service (30000 → 3000)
```

---

## Prerequisites

1. **Docker Desktop** with Kubernetes enabled
   - Settings → Kubernetes → Enable Kubernetes → Apply & Restart
   - Wait for the K8s status indicator to turn green
2. **kubectl** CLI (bundled with Docker Desktop)
3. **Docker images built locally:**
   ```bash
   docker build -t steam-optimizer-db ./database
   docker build -t steam-optimizer-backend ./backend
   docker build -t steam-optimizer-frontend ./frontend
   ```
4. **Secrets configured** in `secrets.yaml` (see [Configuration](#configuration))

---

## Manifests Reference

### `namespace.yaml`

Creates an isolated namespace `steam-optimizer` with standard labels. All other resources are deployed into this namespace.

### `configmap.yaml`

Non-sensitive configuration shared across services:

| Key | Value | Used By |
|-----|-------|---------|
| `MYSQL_HOST` | `mysql` | Backend |
| `MYSQL_PORT` | `3306` | Backend |
| `MYSQL_DATABASE` | `steam_optimizer` | Backend, MySQL |
| `FLASK_ENV` | `production` | Backend |
| `FLASK_DEBUG` | `0` | Backend |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Backend |

### `secrets.yaml`

Base64-encoded credentials. **You must replace the placeholder values before deploying.**

| Key | Placeholder | Used By |
|-----|------------|---------|
| `MYSQL_USER` | `steam_user` | Backend, MySQL |
| `MYSQL_PASSWORD` | `change_me_in_production` | Backend, MySQL |
| `MYSQL_ROOT_PASSWORD` | `change_root_password` | MySQL |
| `FLASK_SECRET_KEY` | `change_me_to_random_secret_key` | Backend |
| `STEAM_API_KEY` | `your_steam_api_key_here` | Backend |
| `GEMINI_API_KEY` | `your_gemini_api_key_here` | Backend |

**To encode your values:**
```bash
echo -n "your_actual_value" | base64
```

### `ingress.yaml`

A placeholder Ingress resource for production deployment with:
- Host-based routing (`steam-optimizer.yourdomain.com`)
- Path-based routing (`/api` → backend, `/` → frontend)
- Comments for enabling TLS with cert-manager
- Requires an Ingress controller (e.g., nginx-ingress)

Not used for local Docker Desktop deployments — use the NodePort service instead.

### MySQL Manifests (`mysql/`)

| File | Resource | Details |
|------|----------|---------|
| `pv.yaml` | PersistentVolume | 5Gi, `hostPath: /tmp/steam-optimizer/mysql-data`, Retain policy, `storageClassName: manual` |
| `pvc.yaml` | PersistentVolumeClaim | 5Gi, binds to the PV via `storageClassName: manual` |
| `deployment.yaml` | Deployment | 1 replica, Recreate strategy (avoids write conflicts), mounts PVC, liveness/readiness probes, resource limits |
| `service.yaml` | Service | ClusterIP on port 3306, only accessible within the cluster |

### Backend Manifests (`backend/`)

| File | Resource | Details |
|------|----------|---------|
| `deployment.yaml` | Deployment | 2 replicas, RollingUpdate (maxSurge: 1, maxUnavailable: 0), loads ConfigMap via `envFrom`, loads secrets via `secretKeyRef`, HTTP probes on `/api/health` |
| `service.yaml` | Service | ClusterIP on port 5000, accessible by frontend nginx |

### Frontend Manifests (`frontend/`)

| File | Resource | Details |
|------|----------|---------|
| `configmap.yaml` | ConfigMap | Contains the full nginx `default.conf` (reverse proxy to backend + SPA fallback) |
| `deployment.yaml` | Deployment | 2 replicas, RollingUpdate, mounts nginx config from ConfigMap at `/etc/nginx/conf.d/default.conf` |
| `service.yaml` | Service | **NodePort** on port 30000 → container port 3000, accessible from `http://localhost:30000` |

---

## Deployment Guide

### Option 1: Using the deploy script (recommended)

```bash
chmod +x deploy.sh
./deploy.sh
```

The script builds images, applies all manifests in order, and waits for each tier to be ready.

### Option 2: Manual deployment

```bash
# 1. Build images
docker build -t steam-optimizer-db ./database
docker build -t steam-optimizer-backend ./backend
docker build -t steam-optimizer-frontend ./frontend

# 2. Create namespace + config
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml

# 3. Deploy MySQL first (backend depends on it)
kubectl apply -f k8s/mysql/
kubectl wait --namespace=steam-optimizer \
  --for=condition=ready pod --selector=app=mysql --timeout=120s

# 4. Deploy Backend
kubectl apply -f k8s/backend/
kubectl wait --namespace=steam-optimizer \
  --for=condition=ready pod --selector=app=backend --timeout=120s

# 5. Deploy Frontend
kubectl apply -f k8s/frontend/
kubectl wait --namespace=steam-optimizer \
  --for=condition=ready pod --selector=app=frontend --timeout=60s

# 6. Verify
kubectl get all -n steam-optimizer
```

### Access the application

- **Frontend:** [http://localhost:30000](http://localhost:30000)
- **Backend (for debugging):** `kubectl port-forward -n steam-optimizer svc/backend 5000:5000`

---

## Configuration

### How config flows into pods

```
configmap.yaml ──envFrom──▶ Backend Pod (env vars)
                            ┌── MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE
                            ├── FLASK_ENV, FLASK_DEBUG
                            └── GEMINI_MODEL

secrets.yaml ──secretKeyRef──▶ Backend Pod (env vars)
                                ┌── MYSQL_USER, MYSQL_PASSWORD
                                ├── FLASK_SECRET_KEY
                                ├── STEAM_API_KEY
                                └── GEMINI_API_KEY

secrets.yaml ──secretKeyRef──▶ MySQL Pod (env vars)
                                ├── MYSQL_ROOT_PASSWORD
                                ├── MYSQL_USER
                                └── MYSQL_PASSWORD

frontend/configmap.yaml ──volumeMount──▶ Frontend Pod (file mount)
                                         └── /etc/nginx/conf.d/default.conf
```

---

## Resource Limits

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|:-----------:|:---------:|:--------------:|:------------:|
| MySQL | 250m | 500m | 512Mi | 1Gi |
| Backend | 250m | 1000m | 256Mi | 1Gi |
| Frontend | 100m | 250m | 64Mi | 128Mi |

---

## Health Checks

### MySQL

| Probe | Method | Details |
|-------|--------|---------|
| Liveness | `mysqladmin ping -h localhost` | Initial delay: 30s, period: 10s |
| Readiness | `mysqladmin ping -h localhost` | Initial delay: 15s, period: 5s |

### Backend

| Probe | Method | Details |
|-------|--------|---------|
| Liveness | `GET /api/health` on port 5000 | Initial delay: 15s, period: 15s, failure threshold: 3 |
| Readiness | `GET /api/health` on port 5000 | Initial delay: 10s, period: 5s, failure threshold: 2 |

### Frontend

| Probe | Method | Details |
|-------|--------|---------|
| Liveness | `GET /` on port 3000 | Initial delay: 5s, period: 15s |
| Readiness | `GET /` on port 3000 | Initial delay: 3s, period: 5s |

---

## Networking

| Service | Type | Port | Target Port | Access |
|---------|------|------|-------------|--------|
| `mysql` | ClusterIP | 3306 | 3306 | Internal only |
| `backend` | ClusterIP | 5000 | 5000 | Internal (reached by frontend nginx) |
| `frontend` | NodePort | 3000 | 3000 | External via `localhost:30000` |

The frontend nginx config reverse-proxies `/api/` requests to `http://backend:5000/api/`, using Kubernetes service DNS resolution.

---

## Storage

### PersistentVolume

- **Capacity:** 5Gi
- **Access mode:** ReadWriteOnce
- **Reclaim policy:** Retain (data preserved when PV is released)
- **Storage class:** `manual`
- **Path:** `/tmp/steam-optimizer/mysql-data` (hostPath)

> **macOS note:** `/tmp` may be cleared on reboot. For persistent data, change the `hostPath` in `pv.yaml` to a different directory (e.g., `~/steam-optimizer-data`).

### PersistentVolumeClaim

- Requests 5Gi with `storageClassName: manual`
- Binds to the PV automatically
- Mounted at `/var/lib/mysql` in the MySQL container

---

## Scaling & Self-Healing

### Scale replicas

```bash
# Scale backend to 4 replicas
kubectl scale deployment backend -n steam-optimizer --replicas=4

# Scale frontend to 3 replicas
kubectl scale deployment frontend -n steam-optimizer --replicas=3
```

> **Note:** MySQL should remain at 1 replica (single-writer architecture). Scaling MySQL requires a different approach (e.g., MySQL Group Replication).

### Self-healing demo

```bash
# Delete a backend pod — K8s will automatically recreate it
kubectl delete pod -n steam-optimizer -l app=backend

# Watch pods recover in real-time
kubectl get pods -n steam-optimizer -w
```

### Rolling updates

```bash
# After rebuilding a Docker image, restart the deployment
kubectl rollout restart deployment/backend -n steam-optimizer

# Watch the rollout progress
kubectl rollout status deployment/backend -n steam-optimizer

# Rollback if something goes wrong
kubectl rollout undo deployment/backend -n steam-optimizer
```

---

## Troubleshooting

### Check overall status

```bash
kubectl get all -n steam-optimizer
```

### View logs

```bash
# Backend logs
kubectl logs -n steam-optimizer -l app=backend --tail=50

# MySQL logs
kubectl logs -n steam-optimizer -l app=mysql --tail=50

# Frontend logs
kubectl logs -n steam-optimizer -l app=frontend --tail=50

# Follow logs in real-time
kubectl logs -n steam-optimizer -l app=backend -f
```

### Debug a pod

```bash
# Get detailed pod info (events, conditions, volumes)
kubectl describe pod <pod-name> -n steam-optimizer

# Open a shell inside a running pod
kubectl exec -it <pod-name> -n steam-optimizer -- /bin/bash

# Connect to MySQL from inside the cluster
kubectl exec -it <mysql-pod-name> -n steam-optimizer -- mysql -u steam_user -p steam_optimizer
```

### Common issues

**Pods stuck in `Pending`**
- Check if PV/PVC is bound: `kubectl get pv,pvc -n steam-optimizer`
- Check node resources: `kubectl describe node`
- Ensure Docker Desktop has enough memory (4GB+ recommended)

**Pods in `ImagePullBackOff`**
- The manifests use `imagePullPolicy: Never` — images must be built locally
- Rebuild: `docker build -t steam-optimizer-backend ./backend`

**Backend can't connect to MySQL**
- MySQL must be fully ready before backend starts
- Check MySQL readiness: `kubectl get pods -n steam-optimizer -l app=mysql`
- Check backend logs for connection errors

**PersistentVolume issues**
- Ensure the host directory exists or the PV has `type: DirectoryOrCreate`
- If PV is in `Released` state, delete and recreate it

### Teardown

```bash
# Remove everything in the namespace
kubectl delete namespace steam-optimizer

# Also clean up the PersistentVolume (cluster-scoped)
kubectl delete pv mysql-pv
```
