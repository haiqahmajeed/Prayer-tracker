from fastapi import FastAPI
from app.routers import health, leads

app = FastAPI(
    title="Lead Management API",
    version="1.0.0",
    description="REST API for managing sales leads through the pipeline.",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.include_router(health.router)
app.include_router(leads.router, prefix="/api/v1/leads")
