# Stage 1: Build Frontend
FROM node:22-slim as frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Setup Backend
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies (if any needed for pdf tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy built frontend assets from Stage 1
COPY --from=frontend-build /app/frontend/dist /app/static

# Expose port (Documentation purpose)
EXPOSE 8000

# Start Application
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
