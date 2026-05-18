#!/bin/bash
# ============================================================
# Steam Achievement Optimizer — Kubernetes Deployment Script
# ============================================================
set -e

echo "=== Steam Achievement Optimizer — K8s Deployment ==="
echo ""

# -----------------------------------------------------------
# Step 1: Build Docker images (using local Docker daemon)
# -----------------------------------------------------------
echo "[1/4] Building Docker images..."
docker build -t steam-optimizer-db ./database
docker build -t steam-optimizer-backend ./backend
docker build -t steam-optimizer-frontend ./frontend
echo "✓ Images built successfully"
echo ""

# -----------------------------------------------------------
# Step 2: Create namespace and config
# -----------------------------------------------------------
echo "[2/4] Applying namespace, configmap, and secrets..."
kubectl apply -f k8s/namespace.yaml
echo "Waiting for namespace to be ready before applying other resources..."
sleep 2
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
echo "✓ Namespace and config applied"
echo ""

# -----------------------------------------------------------
# Step 3: Deploy services
# -----------------------------------------------------------
echo "[3/4] Deploying MySQL..."
kubectl apply -f k8s/mysql/
echo "Waiting for MySQL to be ready..."
kubectl wait --namespace=steam-optimizer \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=database \
  --timeout=120s

echo "Deploying Backend..."
kubectl apply -f k8s/backend/
echo "Waiting for Backend to be ready..."
kubectl wait --namespace=steam-optimizer \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=backend \
  --timeout=120s

echo "Deploying Frontend..."
kubectl apply -f k8s/frontend/
echo "Waiting for Frontend to be ready..."
kubectl wait --namespace=steam-optimizer \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=frontend \
  --timeout=60s
echo "✓ All services deployed"
echo ""

# -----------------------------------------------------------
# Step 4: Status summary
# -----------------------------------------------------------
echo "[4/4] Deployment status:"
echo ""
kubectl get all -n steam-optimizer
echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Access the application:"
echo "  Frontend:  http://localhost:30000"
echo "  Backend:   kubectl port-forward -n steam-optimizer svc/backend 5000:5000"
echo ""
echo "Useful commands:"
echo "  Status:       kubectl get pods -n steam-optimizer"
echo "  Logs:         kubectl logs -n steam-optimizer -l app=backend --tail=50"
echo "  Scale:        kubectl scale deployment backend -n steam-optimizer --replicas=4"
echo "  Self-heal:    kubectl delete pod -n steam-optimizer -l app=backend"
echo "  Rollback:     kubectl rollout undo deployment/backend -n steam-optimizer"
echo "  Teardown:     kubectl delete namespace steam-optimizer"
